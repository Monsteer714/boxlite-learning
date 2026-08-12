# Concept: PTY Support

## Definition
**PTY (Pseudo-Terminal) support** is BoxLite's capability for interactive terminal sessions within a Box. It allows agents or users to interact with processes inside the VM via a terminal interface, with live resize support.

## Details
- Interactive PTY sessions within a Box
- Live resize support for terminal dimensions
- Complements non-interactive async exec (streamed stdout/stderr + exit codes)
- Part of the execution feature area: per-command timeout, workdir, env, run-as-user

## Significance in BoxLite
- Enables interactive debugging inside agent environments
- Supports terminal-based tools and workflows
- Provides a human-in-the-loop option for agent runs

## Related Concepts
- [[concepts/micro-vm|Micro-VM]]

## Related Entities
- [[entities/box|Box]]
- [[entities/boxlite|BoxLite]]

## Sources
- [[sources/boxlite-readme|BoxLite README]]
