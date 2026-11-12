# Changelog

## [0.3.0](https://github.com/tschuba/time-drift/compare/time-drift-v0.2.0...time-drift-v0.3.0) (2026-11-12)


### Features

* add AGPL-3.0 license and footer with copyright, license and version ([#13](https://github.com/tschuba/time-drift/issues/13)) ([8ba2643](https://github.com/tschuba/time-drift/commit/8ba2643e23b06fe38d975bb3726a4887e782a830))
* add analytics page with summary stats, trend chart, bar chart, and heatmap ([f6e2f5b](https://github.com/tschuba/time-drift/commit/f6e2f5b34631cba047f9f2698a62b2c00c9a77b9))
* add analytics query functions and SVG chart rendering service ([49f0771](https://github.com/tschuba/time-drift/commit/49f07712be1a576a8338bb7b151889743c9f3aa1))
* add base template, HTMX, and CSS styles ([957de44](https://github.com/tschuba/time-drift/commit/957de443ef3c2a7b89a66e2fb751483b2b80a326))
* add dashboard page with saldo badge and recent days ([6686554](https://github.com/tschuba/time-drift/commit/66865540491ccbe56bf4aa5a7c452c5512cb4ec6))
* add day entry editor with CRUD routes and templates ([8547910](https://github.com/tschuba/time-drift/commit/85479105ec1abd0fa79e565211363c9fcb56e5c1))
* add Dockerfile and docker-compose.yml for deployment ([32c11ae](https://github.com/tschuba/time-drift/commit/32c11aea2c83bb7e865fae65d438f2e0dffd37a5))
* add Excel to SQL import script for historical data migration ([7039302](https://github.com/tschuba/time-drift/commit/7039302cb625091208b158fb47fe30aa9a944317))
* add history view with pagination and date filters ([a3c4fe6](https://github.com/tschuba/time-drift/commit/a3c4fe6a40f416b256d55e8f6f3715af4252aa15))
* add initial database migration for time_entries and time_blocks ([c04142d](https://github.com/tschuba/time-drift/commit/c04142d6508b8f3dbe99a839f1a508ac12511782))
* add models and database query functions ([a66239a](https://github.com/tschuba/time-drift/commit/a66239a102991b409f3f871cc8ca98b75e0326a7))
* add monthly view with day summaries and navigation ([8601385](https://github.com/tschuba/time-drift/commit/860138588940ab42f63f0b9c29843abff5def325))
* add time service with business logic and unit tests ([abf9cb3](https://github.com/tschuba/time-drift/commit/abf9cb34cc775494e9873849bb292f9a473e6893))
* embed today's time entry form inline on the dashboard ([692ecf5](https://github.com/tschuba/time-drift/commit/692ecf5c0773772b55fa4fad6c4f8adc66dd69a8))
* scaffold Rust project with Axum, sqlx, and config ([078f78d](https://github.com/tschuba/time-drift/commit/078f78dd83b548b804e4c290e0745a91041f0914))
* **ui:** add today's saldo/break stats, highlight edited block, show break in timeline ([#6](https://github.com/tschuba/time-drift/issues/6)) ([42e1e93](https://github.com/tschuba/time-drift/commit/42e1e9357b135d96ee44bb90938c42da75f90dbb))
* **ui:** collapse nav into burger menu on mobile ([#8](https://github.com/tschuba/time-drift/issues/8)) ([e85e989](https://github.com/tschuba/time-drift/commit/e85e989653641b4ccdc28fcaa28f7ac922dbea32))
* **ui:** heatmap hover/pin tooltip and long dates in trend chart ([#7](https://github.com/tschuba/time-drift/issues/7)) ([9dc0710](https://github.com/tschuba/time-drift/commit/9dc0710b2bae1365b9b0a97b8b42cb3e83ac7b0d))
* **ui:** improve usability, add i18n (de/en), dark mode and cache-busting ([#4](https://github.com/tschuba/time-drift/issues/4)) ([94df652](https://github.com/tschuba/time-drift/commit/94df652fea6653f36af357bb0b12c9ad1e098a4b))
* **ui:** timeline block editor and HH:MM time display ([#5](https://github.com/tschuba/time-drift/issues/5)) ([fc50f92](https://github.com/tschuba/time-drift/commit/fc50f9231ddfc9209d2aa6e2aa5fe9ff4a162dad))


### Bug Fixes

* correct midnight-crossing saldo calc and add import skip for incomplete row ([#1](https://github.com/tschuba/time-drift/issues/1)) ([2c01302](https://github.com/tschuba/time-drift/commit/2c0130225d91b9021383070bc20caf52d1f4c399))
* correct saldo calculation for midnight-crossing blocks and multi-target days ([f7791f6](https://github.com/tschuba/time-drift/commit/f7791f6d4689cecd1195afc7202db69c35a22af4))
* don't count days without entry as deficit in month/dashboard views ([#9](https://github.com/tschuba/time-drift/issues/9)) ([53d8ca2](https://github.com/tschuba/time-drift/commit/53d8ca2737a9c21868efea0c015b33d3634f6112))
* redirect to origin page after save/cancel/delete and use client-side block removal ([8646d1a](https://github.com/tschuba/time-drift/commit/8646d1a39bb6d54fa7abbf19e62fb813f17c210d))
* use axum-extra Form extractor to handle single-value form arrays ([15f8f8a](https://github.com/tschuba/time-drift/commit/15f8f8ab98c5fcadaced75328a67c651ccda688d))
