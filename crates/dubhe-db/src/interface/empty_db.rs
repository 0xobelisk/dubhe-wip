//! Empty database implementation.
use crate::interface::{DBErrorMarker, Database, DatabaseRef};
use core::error::Error;
use core::{convert::Infallible, fmt, marker::PhantomData};
use std::string::ToString;
use sui_json_rpc_types::SuiObjectData;
use sui_types::base_types::ObjectID;
use sui_types::object::Object;

/// An empty database that always returns default values when queried
pub type EmptyDB = EmptyDBTyped<Infallible>;

/// An empty database that always returns default values when queried
///
/// This is generic over a type which is used as the database error type.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct EmptyDBTyped<E> {
    _phantom: PhantomData<E>,
}

// Don't derive traits, because the type parameter is unused.
impl<E> Clone for EmptyDBTyped<E> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<E> Copy for EmptyDBTyped<E> {}

impl<E> Default for EmptyDBTyped<E> {
    fn default() -> Self {
        Self::new()
    }
}

impl<E> fmt::Debug for EmptyDBTyped<E> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("EmptyDB").finish_non_exhaustive()
    }
}

impl<E> PartialEq for EmptyDBTyped<E> {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}

impl<E> Eq for EmptyDBTyped<E> {}

impl<E> EmptyDBTyped<E> {
    /// Create a new empty database.
    pub fn new() -> Self {
        Self {
            _phantom: PhantomData,
        }
    }
}

impl<E: DBErrorMarker + Error> Database for EmptyDBTyped<E> {
    type Error = E;

    #[inline]
    fn object(&mut self, _address: ObjectID) -> Result<Option<Object>, Self::Error> {
        Ok(None)
    }

    #[inline]
    fn insert_object(&mut self, _object: Object) -> Result<(), Self::Error> {
        Ok(())
    }
}

impl<E: DBErrorMarker + Error> DatabaseRef for EmptyDBTyped<E> {
    type Error = E;

    #[inline]
    fn object_ref(&self, _address: ObjectID) -> Result<Option<Object>, Self::Error> {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conform_block_hash_calculation() {
        let db = EmptyDB::new();
    }
}
