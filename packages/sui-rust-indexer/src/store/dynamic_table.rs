use serde::{Serialize, Deserialize};
use serde_json::Value;
use super::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicTable {
    pub name: String,
    pub columns: Vec<Column>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    pub name: String,
    pub column_type: String,
    pub nullable: bool,
}

impl DynamicTable {
    pub fn new(name: String) -> Self {
        Self {
            name,
            columns: Vec::new(),
        }
    }
    
    pub fn add_column(&mut self, name: String, column_type: String, nullable: bool) {
        self.columns.push(Column {
            name,
            column_type,
            nullable,
        });
    }
    
    pub fn generate_create_sql(&self) -> Result<String, Error> {
        let mut sql = format!("CREATE TABLE IF NOT EXISTS {} (\n", self.name);
        
        let columns: Vec<String> = self.columns.iter().map(|col| {
            let nullable = if col.nullable { "NULL" } else { "NOT NULL" };
            format!("    {} {} {}", col.name, col.column_type, nullable)
        }).collect();
        
        sql.push_str(&columns.join(",\n"));
        sql.push_str("\n);");
        
        Ok(sql)
    }
    
    pub fn validate_data(&self, data: &Value) -> Result<(), Error> {
        if let Value::Object(obj) = data {
            for col in &self.columns {
                if !col.nullable && !obj.contains_key(&col.name) {
                    return Err(Error::Table(format!(
                        "Missing required field: {}", col.name
                    )));
                }
            }
            Ok(())
        } else {
            Err(Error::Table("Data must be an object type".to_string()))
        }
    }
} 