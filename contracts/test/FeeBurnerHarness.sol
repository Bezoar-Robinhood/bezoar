// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../BezoarFeeBurner.sol";

/// @dev Simulation only: runs one buy-and-burn in the constructor and reverts with the results,
///      so it can be executed with eth_call against live Robinhood Chain state.
contract FeeBurnerHarness is FeeBurnerCore {
    error Result(uint256 spent, uint256 burned, bool onCurve, uint256 supplyBefore, uint256 supplyAfter);

    constructor(address token_, address curve_, uint24 poolFee_, int24 tickSpacing_, address hook_, bool graduated) payable {
        token = IERC20Burnable(token_);
        curve = IPonsCurve(curve_);
        poolFee = poolFee_;
        tickSpacing = tickSpacing_;
        hook = hook_;
        uint256 supplyBefore = token.totalSupply();
        (uint256 spent, uint256 burned, bool onCurve) = _buyAndBurn(msg.value, graduated);
        revert Result(spent, burned, onCurve, supplyBefore, token.totalSupply());
    }
}
