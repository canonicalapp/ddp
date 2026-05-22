# [3.1.0](https://github.com/canonicalapp/ddp/compare/v3.0.2...v3.1.0) (2026-05-22)


### Bug Fixes

* **cli:** honor --env when loading dotenv for database commands ([683ab67](https://github.com/canonicalapp/ddp/commit/683ab675529bf8a1d8fa03f69dd3a41dbb469f3c))
* **sync:** stop false constraint churn and fix removed-table diff SQL ([79060bf](https://github.com/canonicalapp/ddp/commit/79060bfa9de7508002ab03e5802b738739162821))


### Features

* **apply:** add --prune tombstone cleanup and gate backfill on verify ([2442260](https://github.com/canonicalapp/ddp/commit/2442260020d31cdae61198445aa3ecbf997a4e21))
* **state:** consolidate migrate package and order state by FK deps ([064d828](https://github.com/canonicalapp/ddp/commit/064d8280a9bdd2f66ee8185b6989f4acc34e7707))

## [3.0.2](https://github.com/canonicalapp/ddp/compare/v3.0.1...v3.0.2) (2026-05-08)


### Bug Fixes

* **apply:** keep default apply flow unchanged with backfill scaffolds ([1be319d](https://github.com/canonicalapp/ddp/commit/1be319d0be2a7881e2ff867790eb168d4270d570))

## [3.0.1](https://github.com/canonicalapp/ddp/compare/v3.0.0...v3.0.1) (2026-05-08)


### Bug Fixes

* **apply:** remove legacy expand.sql compatibility path ([8ee7044](https://github.com/canonicalapp/ddp/commit/8ee7044af9b3a1721f6f4093edacfca430bc8607))

# [3.0.0](https://github.com/canonicalapp/ddp/compare/v2.3.0...v3.0.0) (2026-05-08)


* feat!: mark inspect intent split as breaking ([d30ad3b](https://github.com/canonicalapp/ddp/commit/d30ad3bf56a919b443ec1bdd12785efd24e208a3))


### Bug Fixes

* **core:** tighten strict checks and reduce runtime overhead ([8a6d7b9](https://github.com/canonicalapp/ddp/commit/8a6d7b9c7fdf7af7bb808b07da0f3fd00ee9746c))


### Features

* **apply:** add backfill-aware split migration and inspect workflows ([ae2810c](https://github.com/canonicalapp/ddp/commit/ae2810cf4ab1d96a2304153c520c6c5c2b3078a3))


### BREAKING CHANGES

* `ddp inspect` no longer executes stale inspection by default; use `ddp inspect stale` or `ddp inspect backfill`.

# [2.3.0](https://github.com/canonicalapp/ddp/compare/v2.2.2...v2.3.0) (2026-05-08)


### Bug Fixes

* **state:** sanitize allowed schema kinds from config ([7db5e28](https://github.com/canonicalapp/ddp/commit/7db5e28922377af283f944e90a5079f2be1ff048))
* **sync:** omit empty diff sections ([d61cc83](https://github.com/canonicalapp/ddp/commit/d61cc83651331d894950aedc25526cc4733021b5))
* **triggers:** ignore preserved rename backups in drop diff ([676b18c](https://github.com/canonicalapp/ddp/commit/676b18c61067250e573952e93afdbce35ce9d5a1))


### Features

* **inspect:** report preserved backup artifacts ([9bff1cb](https://github.com/canonicalapp/ddp/commit/9bff1cb74391e6e7fe2bd294abc1c95c2ab1fb6b))

## [2.2.2](https://github.com/canonicalapp/ddp/compare/v2.2.1...v2.2.2) (2026-04-30)


### Bug Fixes

* **reset:** simplify confirmation and add --yes alias ([ac700a2](https://github.com/canonicalapp/ddp/commit/ac700a28b932e23e770f180da16dc7d5a060b69a))

## [2.2.1](https://github.com/canonicalapp/ddp/compare/v2.2.0...v2.2.1) (2026-04-30)


### Bug Fixes

* **reset:** resolve DB from env and relax local DB guard ([a6652c0](https://github.com/canonicalapp/ddp/commit/a6652c0968ef5781c5dc9f7319fcab19b62d1ea0))

# [2.2.0](https://github.com/canonicalapp/ddp/compare/v2.1.2...v2.2.0) (2026-04-28)


### Features

* **reset:** add dev DB reset command with guardrails ([62851a8](https://github.com/canonicalapp/ddp/commit/62851a8588dee1b671d175efa5fb8697331afcee))

## [2.1.2](https://github.com/canonicalapp/ddp/compare/v2.1.1...v2.1.2) (2026-04-27)


### Bug Fixes

* baseline browser check ([c7d1cdb](https://github.com/canonicalapp/ddp/commit/c7d1cdbbc928edc4f82a572df516972ade137797))
* format seed command output spacing ([efaf763](https://github.com/canonicalapp/ddp/commit/efaf763830189018ef604907c9141b2f84750303))
* harden state diff generation and validation preflight ([390771a](https://github.com/canonicalapp/ddp/commit/390771ab8998334e52817087a05692c63109cb2e))

## [2.1.1](https://github.com/canonicalapp/ddp/compare/v2.1.0...v2.1.1) (2026-04-24)


### Bug Fixes

* implemented idempotent template stubs ([dfb3252](https://github.com/canonicalapp/ddp/commit/dfb3252f71aadc50de8d5883d3ab5fc10cf91a30))

# [2.1.0](https://github.com/canonicalapp/ddp/compare/v2.0.4...v2.1.0) (2026-04-24)


### Features

* ddp seed command implemented ([45cdb3b](https://github.com/canonicalapp/ddp/commit/45cdb3bbe7c792e20a38e4ee8c02b7cce78ff86f))

## [2.0.4](https://github.com/canonicalapp/ddp/compare/v2.0.3...v2.0.4) (2026-04-23)


### Bug Fixes

* readme updated ([98ce3f3](https://github.com/canonicalapp/ddp/commit/98ce3f3b0117d5bede631e492bc77c842e131158))

## [2.0.3](https://github.com/canonicalapp/ddp/compare/v2.0.2...v2.0.3) (2026-04-23)


### Bug Fixes

* ci fix for npm token ([d6e2caf](https://github.com/canonicalapp/ddp/commit/d6e2caf5ca7d7a62243455f24b37e9fae81eb8ce))
* ci packagelog regen ([bccf423](https://github.com/canonicalapp/ddp/commit/bccf42310626a62b007610acfba63e1211811799))
* node version ([2057824](https://github.com/canonicalapp/ddp/commit/205782467efe285d9eb128f225e5e832147c8803))
* packagelock ([52b97c1](https://github.com/canonicalapp/ddp/commit/52b97c144f533649b1fd425f756d4e7bce87797e))

## [2.0.2](https://github.com/canonicalapp/ddp/compare/v2.0.1...v2.0.2) (2026-04-23)


### Bug Fixes

* ci fix for npm token ([fa2c360](https://github.com/canonicalapp/ddp/commit/fa2c36099920d86e6da6f9ca0373801669e479ec))

## [2.0.1](https://github.com/canonicalapp/ddp/compare/v2.0.0...v2.0.1) (2026-04-23)


### Bug Fixes

* format ([06d988d](https://github.com/canonicalapp/ddp/commit/06d988dfe3e2ecb826a25d871cc8baff5c9b69b0))

# 1.0.0 (2026-04-21)


### Bug Fixes

* **release:** avoid preversion during semantic-release npm bump ([eec59df](https://github.com/canonicalapp/ddp/commit/eec59df844f52dee94137404df6b16fb58e86851))
* trigger release after version alignment ([720525d](https://github.com/canonicalapp/ddp/commit/720525d6cfbb340fce6137d2fb756dc3f26d09f9))
