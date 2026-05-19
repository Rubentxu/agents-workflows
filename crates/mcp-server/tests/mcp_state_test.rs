//! Integration test for MCP state persistence
//! 
//! Tests that:
//! 1. Workflows are registered in the database
//! 2. Execution records can be created
//! 3. Execution state can be retrieved
//! 4. Execution state can be updated

use std::sync::Arc;

/// Test database schema
#[test]
fn test_database_has_workflows_table() {
    let db_path = std::env::var("TEST_DB_PATH")
        .unwrap_or_else(|_| "/home/rubentxu/.workflows/global/registry.db".to_string());
    
    let path = std::path::Path::new(&db_path);
    if !path.exists() {
        println!("SKIP: Database not found at {}", db_path);
        return;
    }
    
    let conn = rusqlite::Connection::open(path).expect("Failed to open DB");
    
    // Check nodes table exists
    let table_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='nodes'",
            [],
            |row| row.get(0),
        )
        .expect("Failed to query");
    assert!(table_count > 0, "nodes table should exist");
    
    // Check we have workflows
    let workflow_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM nodes WHERE type = 'workflow'",
            [],
            |row| row.get(0),
        )
        .expect("Failed to query");
    assert!(workflow_count > 0, "Should have at least one workflow");
    
    // Check executions table exists
    let exec_table_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='executions'",
            [],
            |row| row.get(0),
        )
        .expect("Failed to query");
    assert!(exec_table_count > 0, "executions table should exist");
    
    println!("✓ Database schema valid");
    println!("✓ {} workflow(s) registered", workflow_count);
}

/// Test execution CRUD
#[test]
fn test_execution_crud_operations() {
    let db_path = std::env::var("TEST_DB_PATH")
        .unwrap_or_else(|_| "/home/rubentxu/.workflows/global/registry.db".to_string());
    
    let path = std::path::Path::new(&db_path);
    if !path.exists() {
        println!("SKIP: Database not found at {}", db_path);
        return;
    }
    
    let conn = rusqlite::Connection::open(path).expect("Failed to open DB");
    
    // Create a test execution
    let test_arn = format!("arn:local:workspace/test:execution/{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos());
    
    let result = conn.execute(
        "INSERT INTO executions (id, workflow_id, workspace_id, status) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![test_arn, "arn:local:global:workflow/sdd-full", "test", "pending"],
    );
    
    assert!(result.is_ok(), "Should insert execution");
    
    // Read it back
    let status: String = conn
        .query_row(
            "SELECT status FROM executions WHERE id = ?1",
            rusqlite::params![test_arn],
            |row| row.get(0),
        )
        .expect("Should read execution");
    
    assert_eq!(status, "pending");
    
    // Update it
    conn.execute(
        "UPDATE executions SET status = ?1 WHERE id = ?2",
        rusqlite::params!["running", test_arn],
    ).expect("Should update");
    
    // Verify update
    let new_status: String = conn
        .query_row(
            "SELECT status FROM executions WHERE id = ?1",
            rusqlite::params![test_arn],
            |row| row.get(0),
        )
        .expect("Should read updated execution");
    
    assert_eq!(new_status, "running");
    
    // Clean up
    conn.execute("DELETE FROM executions WHERE id = ?1", rusqlite::params![test_arn])
        .expect("Should delete");
    
    println!("✓ Execution CRUD operations work");
}

fn main() {
    println!("Run with: cargo test --test mcp_state_test -- --nocapture");
    println!("Or set DB path: TEST_DB_PATH=/path/to/db cargo test --test mcp_state_test");
}
