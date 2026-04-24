pub mod day;

use axum::Router;
use sqlx::PgPool;

pub fn create_router() -> Router<PgPool> {
    Router::new().merge(day::router())
}
