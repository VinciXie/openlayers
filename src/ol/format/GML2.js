/**
 * @module ol/format/GML2
 */
import {inherits} from '../index.js';
import {createOrUpdate} from '../extent.js';
import {transformWithOptions} from '../format/Feature.js';
import GMLBase from '../format/GMLBase.js';
import XSD from '../format/XSD.js';
import Geometry from '../geom/Geometry.js';
import {assign} from '../obj.js';
import {get as getProjection, transformExtent} from '../proj.js';
import {createElementNS, getAllTextContent, makeArrayPusher, makeChildAppender,
  makeReplacer, makeSimpleNodeFactory, OBJECT_PROPERTY_NODE_FACTORY, pushParseAndPop, pushSerializeAndPop} from '../xml.js';


  /**
 * @const
 * @type {string}
 */
const schemaLocation = GMLBase.GMLNS + ' http://schemas.opengis.net/gml/2.1.2/feature.xsd';


/**
 * @classdesc
 * Feature format for reading and writing data in the GML format,
 * version 2.1.2.
 *
 * @constructor
 * @param {olx.format.GMLOptions=} opt_options Optional configuration object.
 * @extends {ol.format.GMLBase}
 * @api
 */
const GML2 = function(opt_options) {
  const options = /** @type {olx.format.GMLOptions} */
      (opt_options ? opt_options : {});

  GMLBase.call(this, options);

  this.FEATURE_COLLECTION_PARSERS[GMLBase.GMLNS][
    'featureMember'] =
      makeArrayPusher(GMLBase.prototype.readFeaturesInternal);

  /**
   * @inheritDoc
   */
  this.schemaLocation = options.schemaLocation ?
    options.schemaLocation : schemaLocation;

};

inherits(GML2, GMLBase);


/**
 * @param {Node} node Node.
 * @param {Array.<*>} objectStack Object stack.
 * @private
 * @return {Array.<number>|undefined} Flat coordinates.
 */
GML2.prototype.readFlatCoordinates_ = function(node, objectStack) {
  const s = getAllTextContent(node, false).replace(/^\s*|\s*$/g, '');
  const context = /** @type {ol.XmlNodeStackItem} */ (objectStack[0]);
  const containerSrs = context['srsName'];
  let axisOrientation = 'enu';
  if (containerSrs) {
    const proj = getProjection(containerSrs);
    if (proj) {
      axisOrientation = proj.getAxisOrientation();
    }
  }
  const coordsGroups = s.trim().split(/\s+/);
  let x, y, z;
  const flatCoordinates = [];
  for (let i = 0, ii = coordsGroups.length; i < ii; i++) {
    const coords = coordsGroups[i].split(/,+/);
    x = parseFloat(coords[0]);
    y = parseFloat(coords[1]);
    z = (coords.length === 3) ? parseFloat(coords[2]) : 0;
    if (axisOrientation.substr(0, 2) === 'en') {
      flatCoordinates.push(x, y, z);
    } else {
      flatCoordinates.push(y, x, z);
    }
  }
  return flatCoordinates;
};


/**
 * @param {Node} node Node.
 * @param {Array.<*>} objectStack Object stack.
 * @private
 * @return {ol.Extent|undefined} Envelope.
 */
GML2.prototype.readBox_ = function(node, objectStack) {
  /** @type {Array.<number>} */
  const flatCoordinates = pushParseAndPop([null],
    this.BOX_PARSERS_, node, objectStack, this);
  return createOrUpdate(flatCoordinates[1][0],
    flatCoordinates[1][1], flatCoordinates[1][3],
    flatCoordinates[1][4]);
};


/**
 * @param {Node} node Node.
 * @param {Array.<*>} objectStack Object stack.
 * @private
 */
GML2.prototype.innerBoundaryIsParser_ = function(node, objectStack) {
  /** @type {Array.<number>|undefined} */
  const flatLinearRing = pushParseAndPop(undefined,
    this.RING_PARSERS, node, objectStack, this);
  if (flatLinearRing) {
    const flatLinearRings = /** @type {Array.<Array.<number>>} */
        (objectStack[objectStack.length - 1]);
    flatLinearRings.push(flatLinearRing);
  }
};


/**
 * @param {Node} node Node.
 * @param {Array.<*>} objectStack Object stack.
 * @private
 */
GML2.prototype.outerBoundaryIsParser_ = function(node, objectStack) {
  /** @type {Array.<number>|undefined} */
  const flatLinearRing = pushParseAndPop(undefined,
    this.RING_PARSERS, node, objectStack, this);
  if (flatLinearRing) {
    const flatLinearRings = /** @type {Array.<Array.<number>>} */
        (objectStack[objectStack.length - 1]);
    flatLinearRings[0] = flatLinearRing;
  }
};


/**
 * @const
 * @param {*} value Value.
 * @param {Array.<*>} objectStack Object stack.
 * @param {string=} opt_nodeName Node name.
 * @return {Node|undefined} Node.
 * @private
 */
GML2.prototype.GEOMETRY_NODE_FACTORY_ = function(value, objectStack, opt_nodeName) {
  const context = objectStack[objectStack.length - 1];
  const multiSurface = context['multiSurface'];
  const surface = context['surface'];
  const multiCurve = context['multiCurve'];
  let nodeName;
  if (!Array.isArray(value)) {
    nodeName = /** @type {ol.geom.Geometry} */ (value).getType();
    if (nodeName === 'MultiPolygon' && multiSurface === true) {
      nodeName = 'MultiSurface';
    } else if (nodeName === 'Polygon' && surface === true) {
      nodeName = 'Surface';
    } else if (nodeName === 'MultiLineString' && multiCurve === true) {
      nodeName = 'MultiCurve';
    }
  } else {
    nodeName = 'Envelope';
  }
  return createElementNS('http://www.opengis.net/gml',
    nodeName);
};


/**
 * @param {Node} node Node.
 * @param {ol.Feature} feature Feature.
 * @param {Array.<*>} objectStack Node stack.
 */
GML2.prototype.writeFeatureElement = function(node, feature, objectStack) {
  const fid = feature.getId();
  if (fid) {
    node.setAttribute('fid', fid);
  }
  const context = /** @type {Object} */ (objectStack[objectStack.length - 1]);
  const featureNS = context['featureNS'];
  const geometryName = feature.getGeometryName();
  if (!context.serializers) {
    context.serializers = {};
    context.serializers[featureNS] = {};
  }
  const properties = feature.getProperties();
  const keys = [];
  const values = [];
  for (const key in properties) {
    const value = properties[key];
    if (value !== null) {
      keys.push(key);
      values.push(value);
      if (key == geometryName || value instanceof Geometry) {
        if (!(key in context.serializers[featureNS])) {
          context.serializers[featureNS][key] = makeChildAppender(
            this.writeGeometryElement, this);
        }
      } else {
        if (!(key in context.serializers[featureNS])) {
          context.serializers[featureNS][key] = makeChildAppender(
            XSD.writeStringTextNode);
        }
      }
    }
  }
  const item = assign({}, context);
  item.node = node;
  pushSerializeAndPop(/** @type {ol.XmlNodeStackItem} */
    (item), context.serializers,
    makeSimpleNodeFactory(undefined, featureNS),
    values,
    objectStack, keys);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.LineString} geometry LineString geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeCurveOrLineString_ = function(node, geometry, objectStack) {
  const context = objectStack[objectStack.length - 1];
  const srsName = context['srsName'];
  if (node.nodeName !== 'LineStringSegment' && srsName) {
    node.setAttribute('srsName', srsName);
  }
  if (node.nodeName === 'LineString' ||
      node.nodeName === 'LineStringSegment') {
    const coordinates = this.createCoordinatesNode_(node.namespaceURI);
    node.appendChild(coordinates);
    this.writeCoordinates_(coordinates, geometry, objectStack);
  } else if (node.nodeName === 'Curve') {
    const segments = createElementNS(node.namespaceURI, 'segments');
    node.appendChild(segments);
    this.writeCurveSegments_(segments,
      geometry, objectStack);
  }
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.LineString} line LineString geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeLineStringOrCurveMember_ = function(node, line, objectStack) {
  const child = this.GEOMETRY_NODE_FACTORY_(line, objectStack);
  if (child) {
    node.appendChild(child);
    this.writeCurveOrLineString_(child, line, objectStack);
  }
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.MultiLineString} geometry MultiLineString geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeMultiCurveOrLineString_ = function(node, geometry, objectStack) {
  const context = objectStack[objectStack.length - 1];
  const hasZ = context['hasZ'];
  const srsName = context['srsName'];
  const curve = context['curve'];
  if (srsName) {
    node.setAttribute('srsName', srsName);
  }
  const lines = geometry.getLineStrings();
  pushSerializeAndPop({node: node, hasZ: hasZ, srsName: srsName, curve: curve},
    this.LINESTRINGORCURVEMEMBER_SERIALIZERS_,
    this.MULTIGEOMETRY_MEMBER_NODE_FACTORY_, lines,
    objectStack, undefined, this);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.Geometry|ol.Extent} geometry Geometry.
 * @param {Array.<*>} objectStack Node stack.
 */
GML2.prototype.writeGeometryElement = function(node, geometry, objectStack) {
  const context = /** @type {olx.format.WriteOptions} */ (objectStack[objectStack.length - 1]);
  const item = assign({}, context);
  item.node = node;
  let value;
  if (Array.isArray(geometry)) {
    if (context.dataProjection) {
      value = transformExtent(
        geometry, context.featureProjection, context.dataProjection);
    } else {
      value = geometry;
    }
  } else {
    value = transformWithOptions(/** @type {ol.geom.Geometry} */ (geometry), true, context);
  }
  pushSerializeAndPop(/** @type {ol.XmlNodeStackItem} */
    (item), this.GEOMETRY_SERIALIZERS_,
    this.GEOMETRY_NODE_FACTORY_, [value],
    objectStack, undefined, this);
};


/**
 * @param {string} namespaceURI XML namespace.
 * @returns {Node} coordinates node.
 * @private
 */
GML2.prototype.createCoordinatesNode_ = function(namespaceURI) {
  const coordinates = createElementNS(namespaceURI, 'coordinates');
  coordinates.setAttribute('decimal', '.');
  coordinates.setAttribute('cs', ',');
  coordinates.setAttribute('ts', ' ');

  return coordinates;
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.LineString|ol.geom.LinearRing} value Geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeCoordinates_ = function(node, value, objectStack) {
  const context = objectStack[objectStack.length - 1];
  const hasZ = context['hasZ'];
  const srsName = context['srsName'];
  // only 2d for simple features profile
  const points = value.getCoordinates();
  const len = points.length;
  const parts = new Array(len);
  let point;
  for (let i = 0; i < len; ++i) {
    point = points[i];
    parts[i] = this.getCoords_(point, srsName, hasZ);
  }
  XSD.writeStringTextNode(node, parts.join(' '));
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.LineString} line LineString geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeCurveSegments_ = function(node, line, objectStack) {
  const child = createElementNS(node.namespaceURI,
    'LineStringSegment');
  node.appendChild(child);
  this.writeCurveOrLineString_(child, line, objectStack);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.Polygon} geometry Polygon geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeSurfaceOrPolygon_ = function(node, geometry, objectStack) {
  const context = objectStack[objectStack.length - 1];
  const hasZ = context['hasZ'];
  const srsName = context['srsName'];
  if (node.nodeName !== 'PolygonPatch' && srsName) {
    node.setAttribute('srsName', srsName);
  }
  if (node.nodeName === 'Polygon' || node.nodeName === 'PolygonPatch') {
    const rings = geometry.getLinearRings();
    pushSerializeAndPop(
      {node: node, hasZ: hasZ, srsName: srsName},
      this.RING_SERIALIZERS_,
      this.RING_NODE_FACTORY_,
      rings, objectStack, undefined, this);
  } else if (node.nodeName === 'Surface') {
    const patches = createElementNS(node.namespaceURI, 'patches');
    node.appendChild(patches);
    this.writeSurfacePatches_(
      patches, geometry, objectStack);
  }
};


/**
 * @param {*} value Value.
 * @param {Array.<*>} objectStack Object stack.
 * @param {string=} opt_nodeName Node name.
 * @return {Node} Node.
 * @private
 */
GML2.prototype.RING_NODE_FACTORY_ = function(value, objectStack, opt_nodeName) {
  const context = objectStack[objectStack.length - 1];
  const parentNode = context.node;
  const exteriorWritten = context['exteriorWritten'];
  if (exteriorWritten === undefined) {
    context['exteriorWritten'] = true;
  }
  return createElementNS(parentNode.namespaceURI,
    exteriorWritten !== undefined ? 'innerBoundaryIs' : 'outerBoundaryIs');
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.Polygon} polygon Polygon geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeSurfacePatches_ = function(node, polygon, objectStack) {
  const child = createElementNS(node.namespaceURI, 'PolygonPatch');
  node.appendChild(child);
  this.writeSurfaceOrPolygon_(child, polygon, objectStack);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.LinearRing} ring LinearRing geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeRing_ = function(node, ring, objectStack) {
  const linearRing = createElementNS(node.namespaceURI, 'LinearRing');
  node.appendChild(linearRing);
  this.writeLinearRing_(linearRing, ring, objectStack);
};


/**
 * @param {Array.<number>} point Point geometry.
 * @param {string=} opt_srsName Optional srsName
 * @param {boolean=} opt_hasZ whether the geometry has a Z coordinate (is 3D) or not.
 * @return {string} The coords string.
 * @private
 */
GML2.prototype.getCoords_ = function(point, opt_srsName, opt_hasZ) {
  let axisOrientation = 'enu';
  if (opt_srsName) {
    axisOrientation = getProjection(opt_srsName).getAxisOrientation();
  }
  let coords = ((axisOrientation.substr(0, 2) === 'en') ?
    point[0] + ',' + point[1] :
    point[1] + ',' + point[0]);
  if (opt_hasZ) {
    // For newly created points, Z can be undefined.
    const z = point[2] || 0;
    coords += ',' + z;
  }

  return coords;
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.Point} geometry Point geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writePoint_ = function(node, geometry, objectStack) {
  const context = objectStack[objectStack.length - 1];
  const hasZ = context['hasZ'];
  const srsName = context['srsName'];
  if (srsName) {
    node.setAttribute('srsName', srsName);
  }
  const coordinates = this.createCoordinatesNode_(node.namespaceURI);
  node.appendChild(coordinates);
  const point = geometry.getCoordinates();
  const coord = this.getCoords_(point, srsName, hasZ);
  XSD.writeStringTextNode(coordinates, coord);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.MultiPoint} geometry MultiPoint geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeMultiPoint_ = function(node, geometry,
  objectStack) {
  const context = objectStack[objectStack.length - 1];
  const hasZ = context['hasZ'];
  const srsName = context['srsName'];
  if (srsName) {
    node.setAttribute('srsName', srsName);
  }
  const points = geometry.getPoints();
  pushSerializeAndPop({node: node, hasZ: hasZ, srsName: srsName},
    this.POINTMEMBER_SERIALIZERS_,
    makeSimpleNodeFactory('pointMember'), points,
    objectStack, undefined, this);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.Point} point Point geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writePointMember_ = function(node, point, objectStack) {
  const child = createElementNS(node.namespaceURI, 'Point');
  node.appendChild(child);
  this.writePoint_(child, point, objectStack);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.LinearRing} geometry LinearRing geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeLinearRing_ = function(node, geometry, objectStack) {
  const context = objectStack[objectStack.length - 1];
  const srsName = context['srsName'];
  if (srsName) {
    node.setAttribute('srsName', srsName);
  }
  const coordinates = this.createCoordinatesNode_(node.namespaceURI);
  node.appendChild(coordinates);
  this.writeCoordinates_(coordinates, geometry, objectStack);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.MultiPolygon} geometry MultiPolygon geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeMultiSurfaceOrPolygon_ = function(node, geometry, objectStack) {
  const context = objectStack[objectStack.length - 1];
  const hasZ = context['hasZ'];
  const srsName = context['srsName'];
  const surface = context['surface'];
  if (srsName) {
    node.setAttribute('srsName', srsName);
  }
  const polygons = geometry.getPolygons();
  pushSerializeAndPop({node: node, hasZ: hasZ, srsName: srsName, surface: surface},
    this.SURFACEORPOLYGONMEMBER_SERIALIZERS_,
    this.MULTIGEOMETRY_MEMBER_NODE_FACTORY_, polygons,
    objectStack, undefined, this);
};


/**
 * @param {Node} node Node.
 * @param {ol.geom.Polygon} polygon Polygon geometry.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeSurfaceOrPolygonMember_ = function(node, polygon, objectStack) {
  const child = this.GEOMETRY_NODE_FACTORY_(
    polygon, objectStack);
  if (child) {
    node.appendChild(child);
    this.writeSurfaceOrPolygon_(child, polygon, objectStack);
  }
};


/**
 * @param {Node} node Node.
 * @param {ol.Extent} extent Extent.
 * @param {Array.<*>} objectStack Node stack.
 * @private
 */
GML2.prototype.writeEnvelope = function(node, extent, objectStack) {
  const context = objectStack[objectStack.length - 1];
  const srsName = context['srsName'];
  if (srsName) {
    node.setAttribute('srsName', srsName);
  }
  const keys = ['lowerCorner', 'upperCorner'];
  const values = [extent[0] + ' ' + extent[1], extent[2] + ' ' + extent[3]];
  pushSerializeAndPop(/** @type {ol.XmlNodeStackItem} */
    ({node: node}), this.ENVELOPE_SERIALIZERS_,
    OBJECT_PROPERTY_NODE_FACTORY,
    values,
    objectStack, keys, this);
};


/**
 * @const
 * @type {Object.<string, string>}
 */
const MULTIGEOMETRY_TO_MEMBER_NODENAME = {
  'MultiLineString': 'lineStringMember',
  'MultiCurve': 'curveMember',
  'MultiPolygon': 'polygonMember',
  'MultiSurface': 'surfaceMember'
};


/**
 * @const
 * @param {*} value Value.
 * @param {Array.<*>} objectStack Object stack.
 * @param {string=} opt_nodeName Node name.
 * @return {Node|undefined} Node.
 * @private
 */
GML2.prototype.MULTIGEOMETRY_MEMBER_NODE_FACTORY_ = function(value, objectStack, opt_nodeName) {
  const parentNode = objectStack[objectStack.length - 1].node;
  return createElementNS('http://www.opengis.net/gml',
    MULTIGEOMETRY_TO_MEMBER_NODENAME[parentNode.nodeName]);
};


/**
 * @const
 * @type {Object.<string, Object.<string, ol.XmlParser>>}
 * @private
 */
GML2.prototype.GEOMETRY_FLAT_COORDINATES_PARSERS_ = {
  'http://www.opengis.net/gml': {
    'coordinates': makeReplacer(GML2.prototype.readFlatCoordinates_)
  }
};


/**
 * @const
 * @type {Object.<string, Object.<string, ol.XmlParser>>}
 * @private
 */
GML2.prototype.FLAT_LINEAR_RINGS_PARSERS_ = {
  'http://www.opengis.net/gml': {
    'innerBoundaryIs': GML2.prototype.innerBoundaryIsParser_,
    'outerBoundaryIs': GML2.prototype.outerBoundaryIsParser_
  }
};


/**
 * @const
 * @type {Object.<string, Object.<string, ol.XmlParser>>}
 * @private
 */
GML2.prototype.BOX_PARSERS_ = {
  'http://www.opengis.net/gml': {
    'coordinates': makeArrayPusher(
      GML2.prototype.readFlatCoordinates_)
  }
};


/**
 * @const
 * @type {Object.<string, Object.<string, ol.XmlParser>>}
 * @private
 */
GML2.prototype.GEOMETRY_PARSERS_ = {
  'http://www.opengis.net/gml': {
    'Point': makeReplacer(GMLBase.prototype.readPoint),
    'MultiPoint': makeReplacer(
      GMLBase.prototype.readMultiPoint),
    'LineString': makeReplacer(
      GMLBase.prototype.readLineString),
    'MultiLineString': makeReplacer(
      GMLBase.prototype.readMultiLineString),
    'LinearRing': makeReplacer(
      GMLBase.prototype.readLinearRing),
    'Polygon': makeReplacer(GMLBase.prototype.readPolygon),
    'MultiPolygon': makeReplacer(
      GMLBase.prototype.readMultiPolygon),
    'Box': makeReplacer(GML2.prototype.readBox_)
  }
};


/**
 * @const
 * @type {Object.<string, Object.<string, ol.XmlSerializer>>}
 * @private
 */
GML2.prototype.GEOMETRY_SERIALIZERS_ = {
  'http://www.opengis.net/gml': {
    'Curve': makeChildAppender(
      GML2.prototype.writeCurveOrLineString_),
    'MultiCurve': makeChildAppender(
      GML2.prototype.writeMultiCurveOrLineString_),
    'Point': makeChildAppender(GML2.prototype.writePoint_),
    'MultiPoint': makeChildAppender(
      GML2.prototype.writeMultiPoint_),
    'LineString': makeChildAppender(
      GML2.prototype.writeCurveOrLineString_),
    'MultiLineString': makeChildAppender(
      GML2.prototype.writeMultiCurveOrLineString_),
    'LinearRing': makeChildAppender(
      GML2.prototype.writeLinearRing_),
    'Polygon': makeChildAppender(
      GML2.prototype.writeSurfaceOrPolygon_),
    'MultiPolygon': makeChildAppender(
      GML2.prototype.writeMultiSurfaceOrPolygon_),
    'Surface': makeChildAppender(
      GML2.prototype.writeSurfaceOrPolygon_),
    'MultiSurface': makeChildAppender(
      GML2.prototype.writeMultiSurfaceOrPolygon_),
    'Envelope': makeChildAppender(
      GML2.prototype.writeEnvelope)
  }
};


/**
 * @type {Object.<string, Object.<string, ol.XmlSerializer>>}
 * @private
 */
GML2.prototype.LINESTRINGORCURVEMEMBER_SERIALIZERS_ = {
  'http://www.opengis.net/gml': {
    'lineStringMember': makeChildAppender(
      GML2.prototype.writeLineStringOrCurveMember_),
    'curveMember': makeChildAppender(
      GML2.prototype.writeLineStringOrCurveMember_)
  }
};


/**
 * @type {Object.<string, Object.<string, ol.XmlSerializer>>}
 * @private
 */
GML2.prototype.RING_SERIALIZERS_ = {
  'http://www.opengis.net/gml': {
    'outerBoundaryIs': makeChildAppender(GML2.prototype.writeRing_),
    'innerBoundaryIs': makeChildAppender(GML2.prototype.writeRing_)
  }
};


/**
 * @type {Object.<string, Object.<string, ol.XmlSerializer>>}
 * @private
 */
GML2.prototype.POINTMEMBER_SERIALIZERS_ = {
  'http://www.opengis.net/gml': {
    'pointMember': makeChildAppender(
      GML2.prototype.writePointMember_)
  }
};


/**
 * @const
 * @type {Object.<string, Object.<string, ol.XmlSerializer>>}
 * @private
 */
GML2.prototype.SURFACEORPOLYGONMEMBER_SERIALIZERS_ = {
  'http://www.opengis.net/gml': {
    'surfaceMember': makeChildAppender(
      GML2.prototype.writeSurfaceOrPolygonMember_),
    'polygonMember': makeChildAppender(
      GML2.prototype.writeSurfaceOrPolygonMember_)
  }
};


/**
 * @type {Object.<string, Object.<string, ol.XmlSerializer>>}
 * @private
 */
GML2.prototype.ENVELOPE_SERIALIZERS_ = {
  'http://www.opengis.net/gml': {
    'lowerCorner': makeChildAppender(XSD.writeStringTextNode),
    'upperCorner': makeChildAppender(XSD.writeStringTextNode)
  }
};

export default GML2;
