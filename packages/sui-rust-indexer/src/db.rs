use diesel::{ConnectionError, ConnectionResult};
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::pooled_connection::AsyncDieselConnectionManager;
use diesel_async::pooled_connection::ManagerConfig;
use diesel_async::AsyncPgConnection;
use futures_util::future::BoxFuture;
use futures_util::FutureExt;
use std::time::Duration;
use std::env;
use dotenvy::dotenv;

pub type PgConnectionPool = diesel_async::pooled_connection::bb8::Pool<diesel_async::AsyncPgConnection>;
pub type PgPoolConnection<'a> = diesel_async::pooled_connection::bb8::PooledConnection<'a, AsyncPgConnection>;

pub async fn get_connection_pool() -> PgConnectionPool {
    dotenv().ok();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let mut config = ManagerConfig::default();
    config.custom_setup = Box::new(establish_connection);

    let manager = AsyncDieselConnectionManager::<diesel_async::AsyncPgConnection>::new_with_config(
        database_url,
        config,
    );

    Pool::builder()
        .connection_timeout(Duration::from_secs(30))
        .build(manager)
        .await
        .expect("Could not build Postgres DB connection pool")
}

fn establish_connection(config: &str) -> BoxFuture<ConnectionResult<AsyncPgConnection>> {
    let fut = async {
        // We first set up the way we want rustls to work.
        let rustls_config = rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(std::sync::Arc::new(crate::tls::SkipServerCertCheck))
            .with_no_client_auth();
        let tls = tokio_postgres_rustls::MakeRustlsConnect::new(rustls_config);
        let (client, conn) = tokio_postgres::connect(config, tls)
            .await
            .map_err(|e| ConnectionError::BadConnection(e.to_string()))?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                eprintln!("Database connection: {e}");
            }
        });
        AsyncPgConnection::try_from(client).await
    };
    fut.boxed()
} 