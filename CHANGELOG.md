# [2.0.0](https://github.com/mpgxc/logx/compare/v1.1.1...v2.0.0) (2026-07-05)


* feat!: rewrite as structured logger with pluggable exporters (v2) ([c67780a](https://github.com/mpgxc/logx/commit/c67780aaa2ccdf8685a331c4c3aebd5a47bce048))


### BREAKING CHANGES

* requires @nestjs/common/@nestjs/core ^11; LoggerInject is
replaced by InjectLogger + LoggerModule.forFeature; the global token registry
is removed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0189XtQZGfiNSc6RJE2TDC3Y

# [1.1.0](https://github.com/mpgxc/logx/compare/v1.0.1...v1.1.0) (2024-05-05)


### Features

* enable TypeScript declaration generation ([71cd20c](https://github.com/mpgxc/logx/commit/71cd20c7829b57d83e4b37a6ade9480ace6c4ae8))

## [1.0.1](https://github.com/mpgxc/logx/compare/v1.0.0...v1.0.1) (2024-05-04)


### Bug Fixes

* **decorators:** adds configs to resolve decorators refs ([9301b63](https://github.com/mpgxc/logx/commit/9301b63014248eae57d63f35da34dbe7589e803e))

# 1.0.0 (2024-05-04)


### Features

* **module:** starts the first version of the package ([558ed12](https://github.com/mpgxc/logx/commit/558ed12cff360cd1b159260863d4c34e719ff3b7))
