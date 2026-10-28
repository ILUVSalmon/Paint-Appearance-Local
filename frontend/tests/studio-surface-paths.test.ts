import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as repairs from "../src/features/measurements/model-studio/surface-paths";
import { buildWorkshop } from "../src/features/measurements/model-studio/robots";
import { pickBodySurface } from "../src/features/measurements/model-studio/point-layer";

async function loadBody(id: string) {
  const path = id === "ranger" ? "ranger/ranger-body" : `prepared/${id}-body`;
  const bytes = readFileSync(new URL(`../public/models/${path}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  gltf.scene.updateMatrixWorld(true);
  const meshes: T.Mesh[] = [];
  gltf.scene.traverse((node) => {
    if (node instanceof T.Mesh) {
      node.material = new T.MeshBasicMaterial({ side: T.DoubleSide });
      meshes.push(node);
    }
  });
  return meshes;
}

for (const { id, name, height, xs, zs } of [
  {
    id: "everest",
    name: "everest-body",
    height: 1.8,
    xs: [-0.15, 0.2, 0.6, 1],
    zs: [-0.35, 0, 0.35],
  },
  {
    id: "territory",
    name: "cx743-roof",
    height: 1.5,
    xs: [-0.1, 0.2, 0.6, 1.15],
    zs: [-0.32, 0, 0.32],
  },
]) {
  test(`${id} roof infill is pickable across the opening and preserves existing vertices`, async () => {
    const meshes = await loadBody(id);
    const roof = meshes.find((mesh) => mesh.name === name)!;
    const before = Array.from(roof.geometry.attributes.position.array);
    roof.geometry.computeBoundingBox();
    const bounds = roof.geometry.boundingBox!.clone();
    repairs.closeRoofOpenings(meshes);
    for (const x of xs) {
      for (const z of zs) {
        const hit = new T.Raycaster(
          new T.Vector3(x, 3, z),
          new T.Vector3(0, -1, 0),
        ).intersectObjects(meshes)[0];
        assert.ok(hit && hit.point.y > height, `paintable roof at ${x}, ${z}`);
        assert.equal(hit.object.name, name);
        const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.set(x, 3, z);
        camera.up.set(0, 0, -1);
        camera.lookAt(x, 1, z);
        const location = pickBodySurface(camera, meshes, new T.Vector2());
        assert.equal(location?.mesh, name, "inspection picker accepts the infill");
        assert.ok(location && location.position[1] > height);
      }
    }
    assert.deepEqual(
      Array.from(roof.geometry.attributes.position.array).slice(0, before.length),
      before,
    );
    assert.ok(bounds.containsBox(roof.geometry.boundingBox!), "infill stays in registered bounds");
    const count = roof.geometry.attributes.position.count;
    repairs.closeRoofOpenings(meshes);
    assert.equal(roof.geometry.attributes.position.count, count, "repair is idempotent");
  });
}

for (const id of [
  "ranger",
  "everest",
  "transit",
  "amarok",
  "ranger-sgl",
  "ranger-rapcap",
  "ranger-raptor",
  "super-duty",
  "territory",
]) {
  test(`${id}: all four painting paths target real exterior surfaces`, async () => {
    const meshes = await loadBody(id);
    repairs.closeRoofOpenings(meshes);
    const paths = repairs.createSurfacePaths(meshes);
    assert.equal(paths.length, 4);
    for (const path of paths) {
      assert.ok(path.length > 30);
      for (const sample of path) {
        const ray = new T.Raycaster(
          sample.point.clone().addScaledVector(sample.normal, 0.05),
          sample.normal.clone().negate(),
          0,
          0.1,
        );
        const hit = ray.intersectObjects(meshes)[0];
        assert.ok(
          hit && hit.point.distanceTo(sample.point) < 0.001,
          "spray targets the mesh instead of an aperture",
        );
        assert.ok(sample.normal.y > 0, "spray approaches from outside");
      }
    }
    const workshop = buildWorkshop(new T.Scene());
    workshop.fit(meshes);
    let activeSamples = 0;
    for (const t of [0.14, 0.3, 0.5, 0.7, 0.83]) {
      workshop.animate(t);
      workshop.group.updateMatrixWorld(true);
      for (const robot of workshop.group.children.filter((child) =>
        child.name.startsWith("Fixed robot"),
      )) {
        const wrist = robot.getObjectByName("Spray wrist")!;
        const nozzle = wrist.getWorldPosition(new T.Vector3());
        const direction = new T.Vector3(0, -1, 0).applyQuaternion(
          wrist.getWorldQuaternion(new T.Quaternion()),
        );
        const hit = new T.Raycaster(nozzle, direction, 0, 1).intersectObjects(meshes)[0];
        if (robot.getObjectByName("Paint spray")!.visible) {
          activeSamples++;
          assert.ok(hit, `${id}: active spray reaches the body`);
          assert.ok(
            Math.abs(hit.distance - 0.8) < 0.08,
            `${id}: nozzle keeps its stand-off distance (${hit.distance})`,
          );
        }
      }
    }
    assert.ok(activeSamples >= 10, "robots paint for most of the pass");
  });
}
