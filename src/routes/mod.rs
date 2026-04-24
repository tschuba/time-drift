pub mod dashboard;
pub mod day;

use axum::{routing::get, Router};
use sqlx::PgPool;

pub fn create_router() -> Router<PgPool> {
    Router::new()
        .route("/", get(dashboard::handler))
        .merge(day::router())
}
