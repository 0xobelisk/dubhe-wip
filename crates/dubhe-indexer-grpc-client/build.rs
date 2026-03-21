use std::path::{Path, PathBuf};

fn protobuf_include_dirs(proto_dir: &str) -> Vec<PathBuf> {
    let mut includes = vec![PathBuf::from(proto_dir)];

    if let Ok(include) = std::env::var("PROTOC_INCLUDE") {
        includes.push(PathBuf::from(include));
    }

    for candidate in ["/usr/include", "/usr/local/include", "/opt/homebrew/include"] {
        let path = Path::new(candidate).join("google/protobuf/struct.proto");
        if path.exists() {
            includes.push(PathBuf::from(candidate));
        }
    }

    includes
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_dir = "../dubhe-indexer-grpc/proto";
    let proto_file = format!("{proto_dir}/dubhe_grpc.proto");
    let includes = protobuf_include_dirs(proto_dir);
    let include_refs = includes.iter().map(PathBuf::as_path).collect::<Vec<_>>();

    tonic_build::configure()
        .build_server(false)
        .compile(&[proto_file.as_str()], &include_refs)?;

    Ok(())
}
