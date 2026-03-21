use std::path::{Path, PathBuf};

fn protobuf_include_dirs() -> Vec<PathBuf> {
    let mut includes = vec![PathBuf::from("proto")];

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
    let includes = protobuf_include_dirs();
    let include_refs = includes.iter().map(PathBuf::as_path).collect::<Vec<_>>();

    tonic_build::configure().compile(&["proto/dubhe_grpc.proto"], &include_refs)?;
    Ok(())
}
