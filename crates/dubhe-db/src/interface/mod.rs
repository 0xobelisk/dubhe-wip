mod async_db;
mod empty_db;

pub use async_db::*;
pub use empty_db::*;

use auto_impl::auto_impl;
use sui_json_rpc_types::SuiObjectData;
use core::error::Error;
use sui_types::base_types::ObjectID;
use sui_types::object::Object;
use anyhow::Result;
use std::convert::Infallible;



/// Database error marker is needed to implement From conversion for Error type.
pub trait DBErrorMarker {}

/// Implement marker for `()`.
impl DBErrorMarker for () {}
impl DBErrorMarker for Infallible {}
impl DBErrorMarker for String {}

/// Sui database interface.
#[auto_impl(&mut, Box)]
pub trait Database {
    /// The database error type.
    type Error: Error + DBErrorMarker;

    /// Gets basic account information.
    fn object(&mut self, address: ObjectID) -> Result<Option<Object>, Self::Error>;

    /// insert object
    fn insert_object(&mut self, object: Object) -> Result<(), Self::Error>;
}

/// Sui database interface.
///
/// Contains the same methods as [`Database`], but with `&self` receivers instead of `&mut self`.
///
/// Use [`WrapDatabaseRef`] to provide [`Database`] implementation for a type
/// that only implements this trait.
#[auto_impl(&, &mut, Box, Rc, Arc)]
pub trait DatabaseRef {
    /// The database error type.
    type Error: Error + DBErrorMarker;

    /// Gets basic account information.
    fn object_ref(&self, address: ObjectID) -> Result<Option<Object>, Self::Error>;
}