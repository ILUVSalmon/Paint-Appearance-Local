import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Add faces to the registered meshes without moving their existing anchors. */
export function closeRoofOpenings(meshes: T.Mesh[]) {
  closeEverestRoof(meshes);
  closeTerritoryRoof(meshes);
}

function closeTerritoryRoof(meshes: T.Mesh[]) {
  const mesh = meshes.find((item) => item.name === "cx743-roof");
  if (!mesh || mesh.geometry.userData.closedRoof) return;
  const { position } = mesh.geometry.attributes;
  const index = mesh.geometry.index;
  if (!index) return;
  const points = new Map<string, T.Vector3>();
  const edges = new Map<string, { a: string; b: string; count: number }>();
  const key = (i: number) => {
    const p = new T.Vector3().fromBufferAttribute(position, i);
    const id = p
      .toArray()
      .map((n) => n.toFixed(5))
      .join(",");
    points.set(id, p);
    return id;
  };
  // Weld positions only for boundary discovery; leave registered geometry intact.
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [0, 1, 2].map((j) => key(index.getX(i + j)));
    for (let j = 0; j < 3; j++) {
      const a = triangle[j],
        b = triangle[(j + 1) % 3];
      const id = [a, b].sort().join("|");
      const edge = edges.get(id);
      if (edge) edge.count++;
      else edges.set(id, { a, b, count: 1 });
    }
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue;
    for (const [a, b] of [
      [edge.a, edge.b],
      [edge.b, edge.a],
    ]) {
      const neighbours = adjacency.get(a) ?? [];
      neighbours.push(b);
      adjacency.set(a, neighbours);
    }
  }
  const seen = new Set<string>();
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const queue = [start],
      rim: T.Vector3[] = [];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      rim.push(points.get(id)!);
      queue.push(...(adjacency.get(id) ?? []).filter((next) => !seen.has(next)));
    }
    // The source has several roof boundary loops (rear returns and trim). Only
    // the panoramic opening lies wholly within this known model-local envelope.
    if (
      rim.length < 20 ||
      !rim.every((p) => p.x > -0.16 && p.x < 1.28 && p.y > 1.53 && Math.abs(p.z) < 0.42)
    )
      continue;
    const bounds = new T.Box3().setFromPoints(rim);
    const center = bounds.getCenter(new T.Vector3());
    rim.sort(
      (a, b) =>
        Math.atan2(a.z - center.z, a.x - center.x) - Math.atan2(b.z - center.z, b.x - center.x),
    );
    fillRoof(mesh, rim, center.x, center.z);
    return;
  }
}

function closeEverestRoof(meshes: T.Mesh[]) {
  const mesh = meshes.find((item) => item.name === "everest-body");
  if (!mesh || mesh.geometry.userData.closedRoof) return;
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  // Octagonal boundary used by the prepared asset's sunroof cut, in glTF X/Z.
  const outline = [
    [-0.15, -0.47],
    [1.02, -0.47],
    [1.12, -0.37],
    [1.12, 0.37],
    [1.02, 0.47],
    [-0.15, 0.47],
    [-0.25, 0.37],
    [-0.25, -0.37],
  ];
  const boundary = new Map<string, T.Vector3>();
  for (let i = 0; i < position.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(position, i);
    if (p.y < 1.7) continue;
    const onEdge = outline.some(([x, z], index) => {
      const [nx, nz] = outline[(index + 1) % outline.length];
      const dx = nx - x,
        dz = nz - z;
      const t = ((p.x - x) * dx + (p.z - z) * dz) / (dx * dx + dz * dz);
      return (
        t >= -0.0001 && t <= 1.0001 && Math.hypot(p.x - x - t * dx, p.z - z - t * dz) < 0.00002
      );
    });
    if (onEdge) {
      const key = `${p.x.toFixed(5)},${p.z.toFixed(5)}`;
      boundary.set(key, p);
    }
  }
  const rim = [...boundary.values()].sort(
    (a, b) => Math.atan2(a.z, a.x - 0.435) - Math.atan2(b.z, b.x - 0.435),
  );
  if (rim.length < 8) return;
  fillRoof(mesh, rim, 0.435, 0);
}

function fillRoof(mesh: T.Mesh, rim: T.Vector3[], centerX: number, centerZ: number) {
  const geometry = mesh.geometry;
  // Fit the surrounding stamping's quadratic crown. Analytic normals avoid
  // radial reflections from the long, narrow triangles at the cut boundary.
  const system = Array.from({ length: 6 }, () => Array<number>(7).fill(0));
  for (const p of rim) {
    const x = p.x - centerX,
      z = p.z - centerZ;
    const basis = [1, x, z, x * x, x * z, z * z];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) system[row][col] += basis[row] * basis[col];
      system[row][6] += basis[row] * p.y;
    }
  }
  for (let col = 0; col < 6; col++) {
    let pivot = col;
    for (let row = col + 1; row < 6; row++)
      if (Math.abs(system[row][col]) > Math.abs(system[pivot][col])) pivot = row;
    [system[col], system[pivot]] = [system[pivot], system[col]];
    const divisor = system[col][col];
    if (Math.abs(divisor) < 1e-10) return;
    for (let j = col; j <= 6; j++) system[col][j] /= divisor;
    for (let row = 0; row < 6; row++) {
      if (row === col) continue;
      const factor = system[row][col];
      for (let j = col; j <= 6; j++) system[row][j] -= factor * system[col][j];
    }
  }
  const coefficients = system.map((row) => row[6]);
  geometry.computeBoundingBox();
  const center = new T.Vector3(
    centerX,
    Math.min(coefficients[0], geometry.boundingBox!.max.y),
    centerZ,
  );
  const normalAt = (p: T.Vector3) =>
    new T.Vector3(
      -coefficients[1] - 2 * coefficients[3] * (p.x - centerX) - coefficients[4] * (p.z - centerZ),
      1,
      -coefficients[2] - coefficients[4] * (p.x - centerX) - 2 * coefficients[5] * (p.z - centerZ),
    ).normalize();
  const vertices = [...center.toArray()];
  const normals = [...normalAt(center).toArray()];
  const indices: number[] = [];
  for (const p of rim) {
    vertices.push(...p.toArray());
    normals.push(...normalAt(p).toArray());
  }
  for (let i = 0; i < rim.length; i++) indices.push(0, ((i + 1) % rim.length) + 1, i + 1);
  const patch = new T.BufferGeometry();
  patch.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  patch.setIndex(indices);
  patch.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  const merged = mergeGeometries([geometry, patch]);
  patch.dispose();
  if (!merged) return;
  merged.userData.closedRoof = true;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  mesh.geometry = merged;
  geometry.dispose();
}

export type SurfaceSample = { point: T.Vector3; normal: T.Vector3; amount: number };

export function surfaceBelow(
  meshes: T.Mesh[],
  origin: T.Vector3,
): Omit<SurfaceSample, "amount"> | null {
  const ray = new T.Raycaster(origin, new T.Vector3(0, -1, 0));
  ray.firstHitOnly = true;
  const hit = ray.intersectObjects(meshes, false)[0];
  if (!hit?.face) return null;
  const normal = (hit.normal ?? hit.face.normal)
    .clone()
    .applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld));
  if (normal.y < 0) normal.negate();
  if (normal.y < 0.25) return null;
  const approach = new T.Raycaster(
    hit.point.clone().addScaledVector(normal, 0.8),
    normal.clone().negate(),
    0,
    0.81,
  );
  approach.firstHitOnly = true;
  const first = approach.intersectObjects(meshes, false)[0];
  if (!first || first.point.distanceTo(hit.point) > 0.001) normal.set(0, 1, 0);
  return { point: hit.point.clone(), normal };
}

/** Precompute four model-specific lanes; animation reprojects between samples. */
export function createSurfacePaths(meshes: T.Mesh[]): SurfaceSample[][] {
  const bounds = new T.Box3();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    bounds.union(new T.Box3().setFromObject(mesh));
  }
  if (bounds.isEmpty()) return [];
  const size = bounds.getSize(new T.Vector3());
  const center = bounds.getCenter(new T.Vector3());
  return [-1, 1].flatMap((gx) =>
    [-1, 1].map((gz) => {
      const samples: SurfaceSample[] = [];
      for (let i = 0; i <= 64; i++) {
        const amount = i / 64;
        const x = center.x + size.x * (gx < 0 ? -0.46 + amount * 0.46 : amount * 0.46);
        const lane = 0.5 + 0.18 * Math.sin(amount * Math.PI);
        for (const fraction of [lane, 0.75, 0.9, 0.35, 0.15]) {
          const sample = surfaceBelow(
            meshes,
            new T.Vector3(x, bounds.max.y + 1, center.z + gz * size.z * 0.5 * fraction),
          );
          if (!sample) continue;
          samples.push({ ...sample, amount });
          break;
        }
      }
      return samples;
    }),
  );
}
