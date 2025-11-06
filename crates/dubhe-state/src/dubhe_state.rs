use anyhow::Result;
use std::collections::BTreeMap;
use sui_types::base_types::{ObjectID, SequenceNumber};
use sui_types::execution::{DynamicallyLoadedObjectMetadata, ExecutionResults};
use sui_types::move_package::MovePackage;
use sui_types::object::Object;
use sui_types::storage::PackageObject;
use sui_json_rpc_types::SuiObjectData;
use sui_types::base_types::SuiAddress;
use std::collections::BTreeSet;
use std::str::FromStr;
use sui_types::TypeTag;

#[derive(Debug)]
pub struct DubheState {
    pub objects: BTreeMap<ObjectID, Object>,
    pub packages: BTreeMap<ObjectID, PackageObject>,
    pub move_package: BTreeMap<ObjectID, MovePackage>,
    pub last_execution_results: Option<ExecutionResults>,
}

impl DubheState {
    pub fn new() -> Self {
        Self {
            objects: BTreeMap::new(),
            packages: BTreeMap::new(),
            last_execution_results: None,
            move_package: BTreeMap::new(),
        }
    }

    pub fn add_object(&mut self, obj: Object) {
        self.objects.insert(obj.id(), obj);
    }

    pub fn add_package(&mut self, id: ObjectID, pkg: PackageObject) {
        self.packages.insert(id, pkg);
    }

    pub async fn get_object(&self, id: &ObjectID) -> Result<Option<Object>> {
        println!("      Looking up object: {}", id);
        if let Some(obj) = self.objects.get(id) {
            println!("      ✓ Object found in cache");
            return Ok(Some(obj.clone()));
        }
        // self.dragonfly.get_object(id).await
        Ok(None)
    }

    pub fn get_last_events(&self) -> Vec<sui_types::event::Event> {
        match &self.last_execution_results {
            Some(ExecutionResults::V1(v1)) => v1.user_events.clone(),
            Some(ExecutionResults::V2(v2)) => v2.user_events.clone(),
            None => vec![],
        }
    }
}

impl sui_types::storage::BackingPackageStore for DubheState {
    fn get_package_object(
        &self,
        package_id: &ObjectID,
    ) -> sui_types::error::SuiResult<Option<sui_types::storage::PackageObject>> {
        println!("==== DubheState::get_package_object called for: {} ====", package_id);

        // First check if we have the package in our packages map
        if let Some(package) = self.packages.get(package_id) {
            return Ok(Some(package.clone()));
        }

        println!("      ⚠ Package not found: {}", package_id);
        Ok(None)
    }
}

impl sui_types::storage::ObjectStore for DubheState {
    fn get_object(&self, id: &ObjectID) -> Option<Object> {
        println!("==== DubheState::get_object called for: {} ====", id);
        if let Some(obj) = self.objects.get(id) {
            println!("      ✓ Object found in cache");
            Some(obj.clone())
        } else {
            println!("      ⚠ Object not found: {}", id);
            None
        }
    }

    fn get_object_by_key(&self, id: &ObjectID, version: SequenceNumber) -> Option<Object> {
        println!(
            "==== DubheState::get_object_by_key called for: {} at version {} ====", id, version
        );
        if let Some(obj) = self.objects.get(id) {
            if obj.version() == version {
                println!("      ✓ Object found with matching version");
                Some(obj.clone())
            } else {
                println!(
                    "Object found but version mismatch: {} vs {}",
                    obj.version(),
                    version
                );
                None
            }
        } else {
            println!("⚠ Object not found: {}", id);
            None
        }
    }
}

impl sui_types::storage::ChildObjectResolver for DubheState {
    fn read_child_object(
        &self,
        parent_id: &ObjectID,
        child_id: &ObjectID,
        version: SequenceNumber,
    ) -> Result<Option<Object>, sui_types::error::SuiError> {
        println!(
            "==== DubheState::read_child_object called for: parent={}, child={}, version={} ====",
            parent_id, child_id, version
        );
        // For now, just try to read the child object directly from our object store
        // In a full implementation, you'd need to verify parent-child relationships
        if let Some(obj) = self.objects.get(child_id) {
            // TODO: Check version
            println!("      ✓ Child object found with matching version");
            Ok(Some(obj.clone()))
        } else {
            println!("      ⚠ Child object not found");
            Ok(None)
        }
    }

    fn get_object_received_at_version(
        &self,
        parent_id: &ObjectID,
        child_id: &ObjectID,
        version: SequenceNumber,
        epoch: u64,
    ) -> Result<Option<Object>, sui_types::error::SuiError> {
        println!(
            "==== DubheState::get_object_received_at_version called for: parent={}, child={}, version={}, epoch={} ====",
            parent_id, child_id, version, epoch
        );
        // For now, just try to read the object directly
        // In a full implementation, you'd need to verify received object relationships
        if let Some(obj) = self.objects.get(child_id) {
            if obj.version() == version {
                println!("      ✓ Received object found with matching version");
                Ok(Some(obj.clone()))
            } else {
                println!("      ⚠ Received object version mismatch");
                Ok(None)
            }
        } else {
            println!("      ⚠ Received object not found");
            Ok(None)
        }
    }
}

impl sui_types::storage::ParentSync for DubheState {
    fn get_latest_parent_entry_ref_deprecated(
        &self,
        object_id: ObjectID,
    ) -> Option<(
        ObjectID,
        SequenceNumber,
        sui_types::base_types::ObjectDigest,
    )> {
        println!("==== DubheState::get_latest_parent_entry_ref_deprecated called for: {} ====", object_id);
        // For our simple implementation, just return the object's own ref if it exists
        if let Some(obj) = self.objects.get(&object_id) {
            let object_ref = obj.compute_object_reference();
            println!("      ✓ Parent entry found");
            Some(object_ref)
        } else {
            println!("      ⚠ Parent entry not found");
            None
        }
    }
}