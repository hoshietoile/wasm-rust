wasm-build:
	cd wasm && wasm-pack build --target web

wasm-test:
	cd wasm && cargo test

