//! Async database interface.
use crate::interface::{Database, DatabaseRef};
use core::{error::Error, future::Future};
use tokio::runtime::{Handle, Runtime};
use sui_json_rpc_types::SuiObjectData;
use sui_types::base_types::ObjectID;
use sui_types::object::Object;
use crate::interface::DBErrorMarker;

/// The async Sui database interface
///
/// Contains the same methods as [Database], but it returns [Future] type instead.
///
/// Use [WrapDatabaseAsync] to provide [Database] implementation for a type that only implements this trait.
pub trait DatabaseAsync {
    /// The database error type
    type Error: Send + Error + DBErrorMarker;

    /// Gets basic account information.
    fn object_async(
        &mut self,
        address: ObjectID,
    ) -> impl Future<Output = Result<Option<Object>, Self::Error>> + Send;

    /// insert object
    fn insert_object_async(
        &mut self,
        object: Object,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send;
}

/// The async EVM database interface
///
/// Contains the same methods as [DatabaseRef], but it returns [Future] type instead.
///
/// Use [WrapDatabaseAsync] to provide [DatabaseRef] implementation for a type that only implements this trait.
pub trait DatabaseAsyncRef {
    /// The database error type
    type Error: Send + Error + DBErrorMarker;

    /// Gets basic account information.
    fn object_async_ref(
        &self,
        address: ObjectID,
    ) -> impl Future<Output = Result<Option<Object>, Self::Error>> + Send;
}

/// Wraps a [DatabaseAsync] or [DatabaseAsyncRef] to provide a [`Database`] implementation.
#[derive(Debug)]
pub struct WrapDatabaseAsync<T> {
    db: T,
    rt: HandleOrRuntime,
}

impl<T: Clone> Clone for WrapDatabaseAsync<T> {
    fn clone(&self) -> Self {
        Self {
            db: self.db.clone(),
            rt: self.rt.clone(),
        }
    }
}

impl<T> WrapDatabaseAsync<T> {
    /// Wraps a [DatabaseAsync] or [DatabaseAsyncRef] instance.
    ///
    /// Returns `None` if no tokio runtime is available or if the current runtime is a current-thread runtime.
    pub fn new(db: T) -> Option<Self> {
        let rt = match Handle::try_current() {
            Ok(handle) => match handle.runtime_flavor() {
                tokio::runtime::RuntimeFlavor::CurrentThread => return None,
                _ => HandleOrRuntime::Handle(handle),
            },
            Err(_) => return None,
        };
        Some(Self { db, rt })
    }

    /// Wraps a [DatabaseAsync] or [DatabaseAsyncRef] instance, with a runtime.
    ///
    /// Refer to [tokio::runtime::Builder] on how to create a runtime if you are in synchronous world.
    ///
    /// If you are already using something like [tokio::main], call [`WrapDatabaseAsync::new`] instead.
    pub fn with_runtime(db: T, runtime: Runtime) -> Self {
        let rt = HandleOrRuntime::Runtime(runtime);
        Self { db, rt }
    }

    /// Wraps a [DatabaseAsync] or [DatabaseAsyncRef] instance, with a runtime handle.
    ///
    /// This generally allows you to pass any valid runtime handle, refer to [tokio::runtime::Handle] on how
    /// to obtain a handle.
    ///
    /// If you are already in asynchronous world, like [tokio::main], use [`WrapDatabaseAsync::new`] instead.
    pub fn with_handle(db: T, handle: Handle) -> Self {
        let rt = HandleOrRuntime::Handle(handle);
        Self { db, rt }
    }
}

impl<T: DatabaseAsync> Database for WrapDatabaseAsync<T> {
    type Error = T::Error;

    #[inline]
    fn object(&mut self, address: ObjectID) -> Result<Option<Object>, Self::Error> {
        self.rt.block_on(self.db.object_async(address))
    }

    #[inline]
    fn insert_object(&mut self, object: Object) -> Result<(), Self::Error> {
        self.rt.block_on(self.db.insert_object_async(object))
    }
}

impl<T: DatabaseAsyncRef> DatabaseRef for WrapDatabaseAsync<T> {
    type Error = T::Error;

    #[inline]
    fn object_ref(&self, address: ObjectID) -> Result<Option<Object>, Self::Error> {
        self.rt.block_on(self.db.object_async_ref(address))
    }
}

// Hold a tokio runtime handle or full runtime
#[derive(Debug)]
enum HandleOrRuntime {
    Handle(Handle),
    Runtime(Runtime),
}

impl Clone for HandleOrRuntime {
    fn clone(&self) -> Self {
        match self {
            Self::Handle(handle) => Self::Handle(handle.clone()),
            Self::Runtime(_) => panic!("Cannot clone HandleOrRuntime containing a Runtime"),
        }
    }
}

impl HandleOrRuntime {
    #[inline]
    fn block_on<F>(&self, f: F) -> F::Output
    where
        F: Future + Send,
        F::Output: Send,
    {
        match self {
            Self::Handle(handle) => {
                // Use block_in_place only when we're currently inside a multi-threaded Tokio runtime.
                // Otherwise, call handle.block_on directly to avoid panicking outside of a runtime.
                let can_block_in_place = match Handle::try_current() {
                    Ok(current) => !matches!(
                        current.runtime_flavor(),
                        tokio::runtime::RuntimeFlavor::CurrentThread
                    ),
                    Err(_) => false,
                };

                if can_block_in_place {
                    tokio::task::block_in_place(move || handle.block_on(f))
                } else {
                    handle.block_on(f)
                }
            }
            Self::Runtime(rt) => rt.block_on(f),
        }
    }
}
