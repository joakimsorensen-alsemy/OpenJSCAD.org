const { EPS, TAU } = require("../../maths/constants");

const mat4 = require("../../maths/mat4");
const vec3 = require("../../maths/vec3");

const geom3 = require("../../geometries/geom3");
const poly3 = require("../../geometries/poly3");

const retessellate = require("../modifiers/retessellate");
const unionGeom3Sub = require("../booleans/unionGeom3Sub");
const extrudePolygon = require("./extrudePolygon");

/**
 * Expand a 3D mesh in one direction only
 * Based on expandShell but with directional cylinders and vertex handling
 * @param {Object} options - Options object
 * @param {Number} options.delta - Distance to expand
 * @param {String} options.direction - Direction to expand ('y', 'x', or 'z')
 * @param {Number} options.tolerance - How close the normal must be to the direction (default: 0.8)
 * @param {Object} geometry - Input geometry
 */
const expandDirectional = (options, geometry) => {
  const defaults = {
    delta: 1,
    direction: "y", // 'x', 'y', or 'z'
    tolerance: 0.8,
  };
  const { delta, direction, tolerance } = Object.assign({}, defaults, options);

  // Create direction vector
  let directionVector;
  switch (direction) {
    case "x":
      directionVector = [1, 0, 0];
      break;
    case "y":
      directionVector = [0, 1, 0];
      break;
    case "z":
      directionVector = [0, 0, 1];
      break;
    default:
      directionVector = [0, 1, 0]; // default to y
  }

  let result = geom3.create();
  const edges2planes = new Map(); // {edge: [[vertex, vertex], [plane, ...]]}

  const v1 = vec3.create();
  const v2 = vec3.create();

  // First pass: extrude faces and collect edge information
  const polygons = geom3.toPolygons(geometry);
  let extrudedCount = 0;
  let keptCount = 0;

  polygons.forEach((polygon, index) => {
    const normal = poly3.plane(polygon);
    const dotProduct = vec3.dot(normal, directionVector);
    const absDot = Math.abs(dotProduct);

    if (absDot > tolerance) {
      // Face is aligned with direction - extrude it
      const extrudevector = vec3.scale(vec3.create(), normal, 2 * delta);
      const translatedpolygon = poly3.transform(
        mat4.fromTranslation(
          mat4.create(),
          vec3.scale(vec3.create(), extrudevector, -0.5),
        ),
        polygon,
      );
      const extrudedface = extrudePolygon(extrudevector, translatedpolygon);
      result = unionGeom3Sub(result, extrudedface);
      extrudedCount++;
    } else {
      // Face is not aligned - keep as-is
      const faceGeom = geom3.create([polygon]);
      result = unionGeom3Sub(result, faceGeom);
      keptCount++;
    }

    // Collect edges for all faces (for connecting walls)
    const vertices = polygon.vertices;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      const edge = [vertices[i], vertices[j]];
      mapPlaneToEdge(edges2planes, edge, normal);
    }
  });

  console.log(
    `Face processing: ${extrudedCount} extruded, ${keptCount} kept as-is`,
  );

  // Second pass: create directional "walls" instead of full cylinders
  let wallCount = 0;
  edges2planes.forEach((item) => {
    const edge = item[0];
    const planes = item[1];
    const startpoint = edge[0];
    const endpoint = edge[1];

    // Check if this edge needs a connecting wall
    // We need walls for edges between faces with different alignments
    let needsWall = false;
    let alignedPlanes = 0;

    planes.forEach((plane) => {
      const dotProduct = vec3.dot(plane, directionVector);
      if (Math.abs(dotProduct) > tolerance) {
        alignedPlanes++;
      }
    });

    // Need wall if edge is between aligned and non-aligned faces, or is a boundary edge
    needsWall =
      planes.length === 1 ||
      (alignedPlanes > 0 && alignedPlanes < planes.length);

    if (needsWall) {
      // Create directional wall instead of full cylinder
      const translatedStart = vec3.add(
        vec3.create(),
        startpoint,
        vec3.scale(vec3.create(), directionVector, delta),
      );
      const translatedEnd = vec3.add(
        vec3.create(),
        endpoint,
        vec3.scale(vec3.create(), directionVector, delta),
      );

      // Create rectangular wall connecting original edge to translated edge
      const wallVertices = [
        startpoint,
        endpoint,
        translatedEnd,
        translatedStart,
      ];

      const wallPolygon = poly3.create(wallVertices);
      const wallGeom = geom3.create([wallPolygon]);
      result = unionGeom3Sub(result, wallGeom);
      wallCount++;
    }
  });

  console.log(`Created ${wallCount} directional connecting walls`);

  return retessellate(result);
};

/**
 * Helper function to map planes to edges (from original expandShell)
 */
const mapPlaneToEdge = (map, edge, plane) => {
  const key0 = edge[0].toString();
  const key1 = edge[1].toString();
  // Sort keys to make edges undirected
  const key = key0 < key1 ? `${key0},${key1}` : `${key1},${key0}`;
  if (!map.has(key)) {
    const entry = [edge, [plane]];
    map.set(key, entry);
  } else {
    const planes = map.get(key)[1];
    planes.push(plane);
  }
};

module.exports = expandDirectional;
