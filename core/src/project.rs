use serde::Serialize;


#[derive(Serialize, Clone)]
pub struct Project {
    project_id: i64,
}

impl Project {
    pub fn new_from_id(project_id: i64) -> Self {
        Self {
            project_id,
        }
    }

    pub fn project_id(&self) -> i64 {
        self.project_id
    }
}
