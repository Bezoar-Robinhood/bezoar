// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20Burnable {
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function burn(uint256 value) external;
}

interface IPonsFeeEscrow {
    function balanceOf(address recipient) external view returns (uint256);
    function claim() external returns (uint256);
}

interface IPonsCurve {
    function graduated() external view returns (bool);
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256);
}

interface IPonsFactory {
    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
    function memeHook() external view returns (address);
    function feeEscrow() external view returns (address);
}

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

/// @title Bezoar fee burner
/// @notice Receives the $BEZOAR creator fees from Pons. Once per hour anyone can call run(): it claims the
///         fees, sends 85% to the dev wallet and uses 15% to buy $BEZOAR and burn it with ERC20Burnable.burn,
///         so totalSupply goes down. There is no owner and nothing can be changed after deployment.
/// @dev bind() is permissionless and one-time: it only succeeds for the token whose Pons creator fee
///      recipient is this contract, and reads the curve, pool and escrow from the Pons factory.
abstract contract FeeBurnerCore {
    IUniversalRouter public constant ROUTER = IUniversalRouter(0x8876789976dEcBfCbBbe364623C63652db8C0904);
    uint256 public constant BPS = 10_000;

    IERC20Burnable public token;
    IPonsCurve public curve;
    address public hook;
    uint24 public poolFee;
    int24 public tickSpacing;

    /// @notice ETH set aside for burning that has not been spent yet (for example while the curve graduates)
    uint256 public burnReserve;
    uint256 public totalEthToDev;
    uint256 public totalEthSpentOnBurns;
    uint256 public totalTokensBurned;
    uint256 public runs;
    bool private _locked;

    event Burned(uint256 indexed run, uint256 ethSpent, uint256 tokensBurned, uint256 totalSupplyAfter, bool onCurve);

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }

    modifier nonReentrant() {
        require(!_locked, "busy");
        _locked = true;
        _;
        _locked = false;
    }

    receive() external payable {}

    /// @dev Spends up to `amount` ETH on $BEZOAR and burns everything this contract holds. Returns the ETH
    ///      actually spent (the curve refunds what it cannot fill at graduation) and the tokens burned.
    ///      A failed buy spends nothing, so the ETH stays for the next attempt.
    function _buyAndBurn(uint256 amount, bool graduated) internal returns (uint256 spent, uint256 burned, bool onCurve) {
        uint256 before = address(this).balance;
        if (!graduated) {
            onCurve = true;
            try curve.buy{value: amount}(amount, 0, address(this)) {} catch {}
        } else {
            (bytes memory commands, bytes[] memory inputs) = _poolSwap(amount);
            try ROUTER.execute{value: amount}(commands, inputs, block.timestamp) {} catch {}
        }
        spent = before - address(this).balance;

        burned = token.balanceOf(address(this));
        if (burned > 0) token.burn(burned);
    }

    // V4_SWAP: SWAP_EXACT_IN_SINGLE, SETTLE_ALL (ETH), TAKE_ALL ($BEZOAR to this contract)
    function _poolSwap(uint256 amount) private view returns (bytes memory commands, bytes[] memory inputs) {
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            ExactInputSingleParams({
                poolKey: PoolKey(address(0), address(token), poolFee, tickSpacing, hook),
                zeroForOne: true,
                amountIn: uint128(amount),
                amountOutMinimum: 0,
                hookData: ""
            })
        );
        params[1] = abi.encode(address(0), amount);
        params[2] = abi.encode(address(token), uint256(0));

        inputs = new bytes[](1);
        inputs[0] = abi.encode(hex"060c0f", params);
        commands = hex"10";
    }
}

contract BezoarFeeBurner is FeeBurnerCore {
    IPonsFactory public constant FACTORY = IPonsFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    uint256 public constant BURN_BPS = 1_500;
    uint256 public constant INTERVAL = 1 hours;

    address public immutable devWallet;
    IPonsFeeEscrow public feeEscrow;
    uint256 public lastRun;

    event Bound(address indexed token, address indexed curve, address hook, address feeEscrow);
    event Run(uint256 indexed run, uint256 ethClaimed, uint256 ethToDev, uint256 ethAddedToBurn);

    constructor(address devWallet_) {
        require(devWallet_ != address(0), "zero dev wallet");
        devWallet = devWallet_;
    }

    /// @notice Links this contract to the Pons launch that pays its creator fees here. Callable once, by anyone.
    function bind(address token_) external {
        require(address(token) == address(0), "already bound");
        IPonsFactory.LaunchedToken memory l = FACTORY.getLaunchedToken(token_);
        require(l.exists, "not a Pons launch");
        require(l.creatorFeeRecipient == address(this), "fees not routed here");
        require(l.pairToken == address(0), "not an ETH pair");

        token = IERC20Burnable(token_);
        curve = IPonsCurve(l.curve);
        poolFee = l.poolFee;
        tickSpacing = l.tickSpacing;
        hook = FACTORY.memeHook();
        feeEscrow = IPonsFeeEscrow(FACTORY.feeEscrow());
        emit Bound(token_, l.curve, hook, address(feeEscrow));
    }

    /// @notice Claims fees, pays the dev wallet and burns. Anyone can call it, at most once per hour.
    function run() external nonReentrant {
        require(address(token) != address(0), "not bound");
        require(block.timestamp >= lastRun + INTERVAL, "too early");
        lastRun = block.timestamp;
        uint256 id = ++runs;

        uint256 claimed = feeEscrow.balanceOf(address(this));
        if (claimed > 0) feeEscrow.claim();

        uint256 fresh = address(this).balance - burnReserve;
        uint256 toBurn = (fresh * BURN_BPS) / BPS;
        uint256 toDev = fresh - toBurn;
        burnReserve += toBurn;
        emit Run(id, claimed, toDev, toBurn);

        if (toDev > 0) {
            totalEthToDev += toDev;
            (bool ok,) = devWallet.call{value: toDev}("");
            require(ok, "dev transfer failed");
        }

        if (burnReserve == 0) return;
        // While the curve is graduating neither path can buy, so the reserve waits for the next run.
        uint8 phase = FACTORY.getLaunchedToken(address(token)).phase;
        bool graduated = curve.graduated();
        if (graduated && phase != 2) return;

        (uint256 spent, uint256 burned, bool onCurve) = _buyAndBurn(burnReserve, graduated);
        if (spent == 0 && burned == 0) return;
        burnReserve -= spent;
        totalEthSpentOnBurns += spent;
        totalTokensBurned += burned;
        emit Burned(id, spent, burned, token.totalSupply(), onCurve);
    }

    /// @notice Seconds until run() can be called again (0 when it is callable now).
    function secondsUntilNextRun() external view returns (uint256) {
        uint256 next = lastRun + INTERVAL;
        return block.timestamp >= next ? 0 : next - block.timestamp;
    }

    /// @notice Fees waiting in the Pons escrow plus ETH held here.
    function pending() external view returns (uint256 inEscrow, uint256 held, uint256 reservedForBurn) {
        inEscrow = address(feeEscrow) == address(0) ? 0 : feeEscrow.balanceOf(address(this));
        held = address(this).balance;
        reservedForBurn = burnReserve;
    }
}
