  // Copyright (c) Obelisk Labs, Inc.
  // SPDX-License-Identifier: Apache-2.0
  #[allow(unused_use)]
  
  /* Autogenerated file. Do not edit manually. */
  
  module dubhe::dubhe_account {

  use std::ascii::String;

  use dubhe::dubhe_account_status::AccountStatus;

  public struct Account has copy, drop, store {
    balance: u256,
    status: AccountStatus,
  }

  public fun new(balance: u256, status: AccountStatus): Account {
    Account {
                                   balance,status
                               }
  }

  public fun get(self: &Account): (u256,AccountStatus) {
    (self.balance,self.status)
  }

  public fun get_balance(self: &Account): u256 {
    self.balance
  }

  public fun get_status(self: &Account): AccountStatus {
    self.status
  }

  public(package) fun set_balance(self: &mut Account, balance: u256) {
    self.balance = balance;
  }

  public(package) fun set_status(self: &mut Account, status: AccountStatus) {
    self.status = status;
  }

  public(package) fun set(self: &mut Account, balance: u256, status: AccountStatus) {
    self.balance = balance;
    self.status = status;
  }
}
