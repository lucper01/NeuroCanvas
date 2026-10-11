# Security & data privacy

- The Python API is intended for **local loopback use only**. Start it with `--host 127.0.0.1`.
- Do not expose the API on an external address, proxy or shared laboratory network without adding authentication, authorization, rate limits, request limits and auditing.
- Temporary uploads are written to an isolated temporary directory and deleted after import. Loaded signals remain in process memory until eviction, deletion or restart.
- ZIP archives are checked for path traversal and a maximum total decompressed size. Other supply-chain and resource attacks remain possible; avoid importing untrusted executable or binary payloads.
- Public static GitHub Pages deployment cannot access your local files or automatically run MNE on a cloud server. Python analysis requires a separately started local engine.
- Sensitive human EEG or physiological recordings should be handled according to the host institution's data protection policy. Avoid uploading recordings to third-party services unless the applicable agreements permit it.
- The web application has no cloud user accounts, persistence backend or role-based access. These would require a separate security design.
