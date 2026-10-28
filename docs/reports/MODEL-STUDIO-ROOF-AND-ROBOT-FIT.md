# U704 / Territory roofs and model-specific robot paths

Owner requests implemented on 2026-10-28. The owner requested Git commits in this workspace and synchronization into Paint Appearance Local and Paint Appearance Website. Changes are committed locally; pushing and deployment are separate operations.

U704's prepared asset deliberately contained an open sunroof, leaving nothing for the inspection picker to intersect. The studio now closes that aperture when loading the Everest body. The infill uses the existing octagonal boundary and a fitted roof crown with smooth normals. Faces are appended to `everest-body`; original vertices and indices, mesh identity, registered bounds, asset identity and shipped GLB remain intact. Existing saved mesh-local anchors are preserved. The added surface participates in paint, point picking and BVH acceleration.

Territory's source panoramic roof also left an opening. The studio identifies its actual inner boundary by welded edge connectivity and the known aperture envelope, then fits the same smooth roof infill to `cx743-roof`. Rear roof returns and other boundary loops are excluded. Its existing geometry coordinates, identity and registered bounds remain intact.

Robot targets previously used one hardcoded Ranger-shaped trajectory. Each loaded body now supplies four surface-sampled lanes. Robot base positions and arm reach fit its dimensions and remain fixed during the pass. Wrists follow the actual exterior with an outward orientation and 0.8 metre wrist-to-surface offset. Obstructed oblique approaches fall back to a clear vertical approach; spray is disabled across gaps. Animated interpolation is projected back to the mesh to handle roof and bonnet steps. Paint shader sweep bounds now use the same model extent and midpoint as the robot paths.

Validation:

- Full frontend suite in each of Paint Application, Paint Appearance Local and Paint Appearance Website: 489 passed, 0 failed. New regressions load all nine shipped body assets, check real spray intersections and wrist distance, and exercise the inspection picker across both former roof openings. They also verify original vertices, registered bounds and idempotent repair.
- TypeScript, scoped ESLint and production build passed. Build retains a large-chunk advisory.
- Chrome browser review: Everest, Transit, Ranger single cab and Territory completed animated paint passes without page errors. The follow-up Territory roof repair was inspected in top view and completed another paint pass without errors.
- Local screenshots in Paint Application: `frontend/test-results/u704-closed-roof.png`, `frontend/test-results/transit-fitted-robots.png`, `frontend/test-results/territory-closed-roof.png` and `frontend/test-results/territory-fitted-robots.png`. Check logs are in each repository's ignored test output directory.

Both destination repositories initially had clean working trees and the original roof/path implementation. Their relevant source files and both roof GLBs matched the original Paint Application baseline. The five changed frontend files and this report were copied explicitly; deployment-specific configuration was preserved. Source equality was verified after copying.

This remains the existing visual paint preview. Backend, API contracts, measurement data and saved layouts were not edited.
