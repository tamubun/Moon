'use strict';
import * as THREE from '../../js/three/build/three.module.js';
import { TrackballControls } from
  '../../js/three/examples/jsm/controls/TrackballControls.js';
import { Sky } from '../../js/three/examples/jsm/objects/Sky.js';
import { GUI } from '../../js/three/examples/jsm/libs/dat.gui.module.js';

var debug = false,
    helper;
var animate, unloaded_texture;
var scenes = [], renderers = [], cameras = [], controls = [];
var e1 = new THREE.Vector3(1,0,0),
    e2 = new THREE.Vector3(0,1,0),
    e3 = new THREE.Vector3(0,0,1),
    zero = new THREE.Vector3(0,0,0),
    earth_th = 23.4 / 180.0 * Math.PI,
    earth_axis = new THREE.Vector3(0,Math.sin(earth_th),Math.cos(earth_th)),
    moon_th = 5.1 / 180.0 * Math.PI,   // 黄道に対する月の公転軸の傾き
    moon_th2 = -1.5 / 180.0 * Math.PI; // 黄道に対する月の自転軸の傾き(未使用)
var celestial,      // 天球
    sun_trajectory,
    ecliptic0,
    moons_path0,
    sun0, moon0,
    cel_radius = 200;
var ground1, earth1, moon1,
    arena1_scale = 200,
    earth_radius = arena1_scale / 2.5,
    sun_light1, moons_path1;
var sun2, earth2, moon2, sun_light2;

/* 黄道座標系(arena1の座標系: x方向=春分点 y方向=夏至点 z方向 りゅう座の頭)
   から見た成分vで表されるベクトルの方向にある星を赤道上にある地表Pから見た時の
     th: 南中時の天頂角(南が正)
     phi: Pが春分点を向いている時に天の北極回りの回転角(天頂方向が0、東が正)
   で表現する。正午からphiに相当する時間だけ巻き戻せば、その星がPで南中する */
function eclipticToGround(v) {
  var v2 = v.clone().applyAxisAngle(e1, earth_th), // 赤道座標から見た成分
      th, phi;
  th = -Math.asin(v2.z);
  v2.setZ(0).normalize();
  phi = Math.acos(v2.x);
  if ( v2.y < 0 )
    phi = -phi;
  return { th: th, phi: phi };
}

/* d = 0を春分の日(3/20に固定)として、任意の d に対応する月日を返す */
var months = [31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28];
function calcDate(d) {
  var m, attr;

  if ( d === 0 || d === 365 )
    attr = ' (春分)';
  else if ( d === Math.floor(0.5+365/2.0) )
    attr = ' (秋分)';
  else if ( d === Math.floor(0.5+365/4.0) )
    attr = ' (夏至)';
  else if ( d === Math.floor(0.5+365/4.0*3.0) )
    attr = ' (冬至)';
  else
    attr = '';

  d += 19;
  for ( m = 0; m < 12; ++m ) {
    if ( d < months[m] )
      break;
    d -= months[m];
  }
  if ( m > 9 )
    m-=12;
  return ""+(m+3)+"/"+(d+1) + attr;
}

function newSettings() {
  var latitude = $('#latitude').val() / 180.0 * Math.PI,
      year_phase = $('#date').val()/365.0*2*Math.PI,
      date_phase = $('#time').val()/24.0*2*Math.PI - Math.PI,
      lunar_phase = $('#lunar-phase').val()/360*2*Math.PI,
      node_phase =  $('#node').val()/180*Math.PI,
      angles,
      q = new THREE.Quaternion(),
      v = new THREE.Vector3();

  $('#date-label').text('日付: ' + calcDate(+$('#date').val()));
  lunar_phase +=
    (+$('#date').val()+($('#time').val()-12)/24.0)/29.5306*2*Math.PI;
  year_phase +=
    ($('#time').val()-12)/24.0/365.0*2*Math.PI;
  angles = eclipticToGround(e1.clone().applyAxisAngle(e3, year_phase));

  q.setFromAxisAngle(e2, -date_phase);
  celestial.quaternion.setFromAxisAngle(e1, latitude);
  celestial.quaternion.multiply(q);
  sun_trajectory.scale.set(
    Math.cos(angles.th) * cel_radius, 1, Math.cos(angles.th) * cel_radius);
  sun_trajectory.position.y = -Math.sin(angles.th) * cel_radius;
  sun0.position.set(
    0, -Math.sin(angles.th) * cel_radius, Math.cos(angles.th) * cel_radius);
  ecliptic0.rotation.set(0,-angles.phi, earth_th);
  /* 白道はローカル座標系で、黄道に重ねるように赤道を回し、そのあと5.1度傾ける。
     と言うことは、グローバル座標系では、掛け算の順を逆にする */
  q.setFromEuler(new THREE.Euler(0, -node_phase, moon_th));
  moons_path0.rotation.set(0,-angles.phi, earth_th);
  moons_path0.quaternion.multiply(q);
  ecliptic0.visible = $('#sun-line').prop('checked');
  moons_path0.visible = $('#moon-line').prop('checked');

  ground1.position.set(
    Math.cos(latitude) * earth_radius, 0, Math.sin(latitude) * earth_radius);
  ground1.rotation.set(0, Math.PI/2-latitude, 0);
  earth1.quaternion.setFromAxisAngle(e3, angles.phi + date_phase);
  earth1.rotation.x = -earth_th;
  sun_light1.position.set(
    Math.cos(year_phase) * arena1_scale * 1.8,
    Math.sin(year_phase) * arena1_scale * 1.8,
    0);

  q.setFromAxisAngle(e1, moon_th);
  moons_path1.quaternion.setFromAxisAngle(e3, -node_phase).multiply(q);
  var d = lunar_phase + node_phase + year_phase, // 昇交点と月との黄経差
      psi,      // 昇交点からの月の軌道上での回転角
      moon_vec; // 月の方向 (arena1での座標系)
  d = d - 2*Math.PI * Math.floor(d/2.0/Math.PI);
  if ( Math.abs(Math.cos(d)) < 0.001 ) {
    psi = Math.sin(d) > 0 ? Math.PI / 2 : Math.PI * 1.5;
  } else {
    psi = Math.atan(Math.tan(d) / Math.cos(moon_th));
    if ( d > Math.PI/2 && d <= Math.PI * 1.5 )
      psi = Math.PI + psi;
  }
  q.setFromAxisAngle(e3, psi);
  q.multiplyQuaternions(moons_path1.quaternion, q);
  moon_vec = e1.clone().applyQuaternion(q);
  moon1.position.set(
    1.4 * arena1_scale * moon_vec.x,
    1.4 * arena1_scale * moon_vec.y,
    1.4 * arena1_scale * moon_vec.z);
  var moon_angles = eclipticToGround(moon_vec);
  v.set(
    Math.cos(moon_angles.th) * Math.sin(moon_angles.phi - angles.phi),
    -Math.sin(moon_angles.th),
    Math.cos(moon_angles.th) * Math.cos(moon_angles.phi - angles.phi));
  moon0.position.copy(v.clone().applyQuaternion(celestial.quaternion).multiplyScalar(cel_radius * 0.95));

  moon2.position.copy(v.clone().applyQuaternion(celestial.quaternion).multiplyScalar(20));
  /* arena0座標で、赤道上からみて月の北極が向いている方向を定める。
     月は、その軸回りを自転する。
     月の北極は、黄道軸と一致していると近似。ほんとは moon_th2傾いてる */
  var moon_axis_angles = eclipticToGround(e3),
      n = new THREE.Vector3( // 月の北極をこちらに向ければいい
        Math.cos(moon_axis_angles.th) *
	  Math.sin(moon_axis_angles.phi - year_phase),
       -Math.sin(moon_axis_angles.th),
        Math.cos(moon_axis_angles.th) *
	  Math.cos(moon_axis_angles.phi - year_phase)),
       m = new THREE.Matrix4();
  m.lookAt(n, zero, e1); // Object3D.lookAt()のソースから
  moon0.quaternion.setFromRotationMatrix(m);
  moon0.rotateOnAxis(e1, Math.PI/2);
  moon0.rotateOnAxis(e2, Math.PI + lunar_phase);
  moon0.quaternion.multiplyQuaternions(celestial.quaternion, moon0.quaternion);
  moon2.quaternion.copy(moon0.quaternion);

  sun_light2.position
    .set(0, -Math.sin(angles.th), Math.cos(angles.th))
    .applyQuaternion(celestial.quaternion);

  sun2.position
    .set(0, -Math.sin(angles.th), Math.cos(angles.th))
    .applyQuaternion(celestial.quaternion)
    .multiplyScalar(40);

  cameras[2].lookAt(moon2.position);
}

function showLabels0(font) {
  var material = new THREE.MeshBasicMaterial({color: 'black'}),
      text,
      scene = scenes[0];

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'N', {size:30, height:0.2, curveSegments: 2, font: font}),
    material);
  text.position.set(0, cel_radius+40, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'S', {size:30, height:0.2, curveSegments: 2, font: font}),
    material);
  text.position.set(0, -cel_radius-15, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'E', {size:30, height:0.2, curveSegments: 2, font: font}),
    material);
  text.position.set(cel_radius+30, 0, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'W', {size:30, height:0.2, curveSegments: 2, font: font}),
    material);
  text.position.set(-cel_radius-30, 0, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);
}

function showLabels1(plane, font) {
  var material = new THREE.MeshBasicMaterial({color: 'black'}),
      text;

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'N', {size:15, height:0.2, curveSegments: 2, font: font}),
    material);
  text.position.set(-arena1_scale*0.28, 0, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'S', {size:15, height:0.2, curveSegments: 2, font: font}),
    material);
  text.position.set(arena1_scale*0.35, 0, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'E', {size:15, height:0.2, curveSegments: 2, font: font}),
    material);
  text.position.set(0, arena1_scale*0.3, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'W', {size:15, height:0.2, curveSegments: 2, font: font}),
    material);
  text.position.set(0, -arena1_scale*0.37, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);
}

function showLabels() {
  var loader = new THREE.FontLoader();
  loader.load(
	'../../js/three/examples/fonts/helvetiker_regular.typeface.json',
	function(font) {
	  showLabels0(font);
	  showLabels1(ground1, font);
	});
}

function initValues() {
  $(location.hash.substring(1).split('&')).each(function(i,s) {
    var keyval = s.split('='), key = keyval[0], val = +keyval[1];
    if ( key === 'sun-line' || key === 'moon-line' ) {
      $('#' + key).prop('checked', val===1).checkboxradio('refresh');
    } else {
      $('#' + key).val(val).slider('refresh');
    }
  });
}

/* arena0 の初期設定 */
function init0() {
  var arena = $('#arena0'),
      scene = new THREE.Scene(),
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }),
      camera = new THREE.PerspectiveCamera(
        45, arena.innerWidth() / arena.innerHeight(), 1, 2000),
      control = new TrackballControls(camera, arena[0]);

  scenes.push(scene);
  renderers.push(renderer);
  cameras.push(camera);
  controls.push(control);

  camera.position.set(850, 50, 400); // x: 画面手前向き, y: 右向き, z: 上向き
  camera.up = e3.clone();

  control.rotateSpeed = 1.0;
  control.zoomSpeed = 1.2;
  control.panSpeed = 0.8;
  control.noZoom = false;
  control.noPan = false;
  control.staticMoving = true;
  control.dynamicDampingFactor = 0.3;
  control.enabled = true;

  celestial = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius,30,20),
    new THREE.MeshLambertMaterial(
      { color: 'blue', transparent: true, opacity: 0.1 }));
  scene.add(celestial);

  var polaris0 = new THREE.Mesh(        // 天の北極
    new THREE.OctahedronGeometry(5),
    new THREE.MeshLambertMaterial({ color: 'gold', emissive: 0x999933 }));
  polaris0.position.y = cel_radius;
  celestial.add(polaris0);

  var material = new THREE.LineBasicMaterial({ color: 0xaaaacc }),
      geo = new THREE.Geometry(),
      trajectory, i, th;

  for ( i = 0; i < 41; ++i ) {
    th = 2*Math.PI / 40 * i;
    geo.vertices.push(new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
  }
  var circle = new THREE.Line(geo, material);
  circle.computeLineDistances();

  // 春分、秋分
  trajectory = circle.clone();
  trajectory.scale.set(cel_radius, 1, cel_radius);
  celestial.add(trajectory);

  // 夏至
  trajectory = circle.clone();
  trajectory.scale.set(
    Math.cos(earth_th) * cel_radius, 1, Math.cos(earth_th) * cel_radius);
  trajectory.position.y = Math.sin(earth_th) * cel_radius;
  celestial.add(trajectory);

  // 冬至
  trajectory = circle.clone();
  trajectory.scale.set(
    Math.cos(earth_th) * cel_radius, 1, Math.cos(earth_th) * cel_radius);
  trajectory.position.y = -Math.sin(earth_th) * cel_radius;
  celestial.add(trajectory);

  // 黄道
  ecliptic0 =  new THREE.Line(
    geo, new THREE.LineBasicMaterial({ color: 'yellow' }));
  ecliptic0.scale.set(cel_radius, 1, cel_radius);
  celestial.add(ecliptic0);

  // 白道
  moons_path0 =  new THREE.Line(
    geo, new THREE.LineDashedMaterial({ color: 'lightgray', dashSize: 0.05, gapSize: 0.05 }));
  moons_path0.scale.set(0.95 * cel_radius, 1, 0.95 * cel_radius);
  celestial.add(moons_path0);

  // 天頂
  var  zenith = new THREE.Mesh(
    new THREE.SphereGeometry(2),
    new THREE.MeshBasicMaterial({color: 'black'}));
  zenith.position.set(0, 0, cel_radius);
  scene.add(zenith);

  // 指定した日の太陽の軌跡と月の軌跡
  sun_trajectory = new THREE.Line(
    geo, new THREE.LineBasicMaterial({ color: 0xff7777, linewidth: 3}));
  celestial.add(sun_trajectory);

  sun0 = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius*0.1, 30, 20),
    new THREE.MeshLambertMaterial(
      { color: 'yellow', emissive: 0xffff40 }));
  celestial.add(sun0);

  var sun_light0 = new THREE.DirectionalLight(0xffffff);
  sun_light0.target = scene;
  sun0.add(sun_light0);

  moon0 = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius*0.07, 30, 20),
    new THREE.MeshLambertMaterial(
      { color: 'white' }));
  scene.add(moon0);

  if ( debug ) {
    moon0.add(new THREE.AxisHelper(cel_radius*0.11));
  }

  var brown = new THREE.MeshLambertMaterial(
        { color: 0xaa7733, transparent: true, opacity: 0.8 }),
      black = new THREE.MeshLambertMaterial(
        { color: 0, transparent: true, opacity: 0.8 }),
      ground_material = [black, black, black, black, brown, black],
      ground0 = new THREE.Mesh(
        new THREE.CubeGeometry(600, 600,cel_radius * 1.1), ground_material);
  ground0.position.z = -cel_radius*1.1/2;
  scene.add(ground0);

/*
  var light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0,0,50);
  light.target = ground0;
  scene.add(light);
*/
  scene.add(new THREE.AmbientLight(0x222));
  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  $('#arena0').append(renderer.domElement);
}

/* arena1 の初期設定 */
function init1() {
  var arena = $('#arena1'),
      scene = new THREE.Scene(),
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }),
      camera = new THREE.PerspectiveCamera(
        45, arena.innerWidth() / arena.innerHeight(), 1, 2000),
      control = new TrackballControls(camera, arena[0]);

  scenes.push(scene);
  renderers.push(renderer);
  cameras.push(camera);
  controls.push(control);

  camera.position.set(900, 50, 200); // x: 画面手前向き, y: 右向き, z: 上向き
  camera.up = e3.clone();

  control.target.z = 80;
  control.rotateSpeed = 1.0;
  control.zoomSpeed = 1.2;
  control.panSpeed = 0.8;
  control.noZoom = false;
  control.noPan = false;
  control.staticMoving = true;
  control.dynamicDampingFactor = 0.3;
  control.enabled = true;

  var polaris1 = new THREE.Mesh(        // 天の北極
    new THREE.OctahedronGeometry(5),
    new THREE.MeshLambertMaterial({ color: 'gold', emissive: 0x999933 }));
  polaris1.position.set(
    0,
    Math.sin(earth_th) * arena1_scale * 0.9,
    Math.cos(earth_th) * arena1_scale * 0.9);
  scene.add(polaris1);

  earth1 = new THREE.Object3D();
  var texture = (new THREE.TextureLoader).load(
        'land_ocean_ice_cloud_2048.jpeg',
        function() {
          unloaded_texture -= 1;
          if ( unloaded_texture < 1 )
            $('#loading').hide();
        }),
      sphere = new THREE.Mesh(
        new THREE.SphereGeometry(earth_radius, 30, 20),
        new THREE.MeshLambertMaterial({ map: texture }));
  sphere.rotation.set(Math.PI/2, Math.PI/0.8, 0);
  earth1.add(sphere);
  scene.add(earth1);

  var material = new THREE.LineBasicMaterial({ color: 0xaaaacc }),
      geo = new THREE.Geometry(),
      trajectory, i, th, circle;

  for ( i = 0; i < 41; ++i ) {
    th = 2*Math.PI / 40 * i;
    geo.vertices.push(new THREE.Vector3(Math.cos(th), Math.sin(th), 0));
  }
  circle = new THREE.Line(geo, material);

  // 赤道
  trajectory = circle.clone();
  trajectory.scale.set(earth_radius, earth_radius, 1);
  earth1.add(trajectory);

  // 北回帰線
  trajectory = circle.clone();
  trajectory.scale.set(
    Math.cos(earth_th) * earth_radius, Math.cos(earth_th) * earth_radius, 1);
  trajectory.position.z = Math.sin(earth_th) * earth_radius;
  earth1.add(trajectory);

  // 南回帰線
  trajectory = circle.clone();
  trajectory.scale.set(
    Math.cos(earth_th) * earth_radius, Math.cos(earth_th) * earth_radius, 1);
  trajectory.position.z = -Math.sin(earth_th) * earth_radius;
  earth1.add(trajectory);

  // 黄道
  trajectory = circle.clone();
  trajectory.scale.set(
    arena1_scale * 1.8, arena1_scale * 1.8, 1);
  scene.add(trajectory);

  ground1 = new THREE.Mesh(
    new THREE.PlaneGeometry(arena1_scale*0.8, arena1_scale*0.8),
    new THREE.MeshLambertMaterial(
      { color: 0xaa7744, transparent: true, opacity: 0.9 }));
  var ground_back = new THREE.Mesh(
    new THREE.PlaneGeometry(arena1_scale*0.8, arena1_scale*0.8),
    new THREE.MeshLambertMaterial({ color: 'black' }));
  ground_back.rotation.x = Math.PI;
  ground1.add(ground_back);
  earth1.add(ground1);

  sun_light1 = new THREE.DirectionalLight(0xffffff, 1.2);
  sun_light1.target = earth1;
  scene.add(sun_light1);
//  scene.add(new THREE.AmbientLight(0x101010));

  var sun1 = new THREE.Mesh(
    new THREE.SphereGeometry(arena1_scale*0.1, 30, 20),
    new THREE.MeshLambertMaterial(
      { color: 'yellow', emissive: 0xffff40 }));
  sun_light1.add(sun1);

  // 白道
  moons_path1 = new THREE.Object3D();
  scene.add(moons_path1);
  trajectory = circle.clone();
  trajectory.scale.set(
    arena1_scale * 1.4, arena1_scale * 1.4, 1);
  moons_path1.add(trajectory);

  // 昇交点、降交点
  var node = new THREE.Mesh(
    new THREE.SphereGeometry(3),
    new THREE.MeshLambertMaterial({ color: 0, emissive: 'red' }));
  node.position.x = arena1_scale * 1.4;
  moons_path1.add(node);
  node = node.clone();
  node.position.x = arena1_scale * 1.8;
  moons_path1.add(node);
  node = new THREE.Mesh(
    new THREE.SphereGeometry(3),
    new THREE.MeshLambertMaterial({ color: 'black' }));
  node.position.x = -arena1_scale * 1.4;
  moons_path1.add(node);
  node = node.clone();
  node.position.x = -arena1_scale * 1.8;
  moons_path1.add(node);

  moon1 = new THREE.Mesh(
    new THREE.SphereGeometry(arena1_scale*0.07, 30, 20),
    new THREE.MeshLambertMaterial({ color: 'gray' }));
  scene.add(moon1);

  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  $('#arena1').append(renderer.domElement);
}

/* arena2 の初期設定 */
function init2() {
  var arena = $('#arena2'),
      scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(
        0.8, arena.innerWidth() / arena.innerHeight(), 0.07, 100),
      sky = new Sky(),
      sunSphere,
      texture = (new THREE.TextureLoader).load(
        'moon.jpeg',
        function() {
          unloaded_texture -= 1;
          if ( unloaded_texture < 1 )
            $('#loading').hide();
        }),
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

  scenes.push(scene);
  renderers.push(renderer);
  cameras.push(camera);

  camera.position.set(0,0,0);
  camera.up = e3.clone();

    sky.scale.setScalar(450000);
    scene.add(sky);  
    sunSphere = new THREE.Mesh(
	new THREE.SphereBufferGeometry( 20000, 16, 8 ),
	new THREE.MeshBasicMaterial( { color: 0xffffff } )
    );
    sunSphere.position.y = -700000;
    sunSphere.visible = false;
    scene.add(sunSphere);

    var effectController = {
	turbidity: 10,
	rayleigh: 2,
	mieCoefficient: 0.005,
	mieDirectionalG: 0.8,
	luminance: 1,
	inclination: 0.49, // elevation / inclination
	azimuth: 0.25, // Facing front,
	sun: ! true
    };
    var distance = 400;

    function guiChanged() {
	var uniforms = sky.material.uniforms;
	uniforms[ "turbidity" ].value = effectController.turbidity;
	uniforms[ "rayleigh" ].value = effectController.rayleigh;
	uniforms[ "luminance" ].value = effectController.luminance;
	uniforms[ "mieCoefficient" ].value = effectController.mieCoefficient;
	uniforms[ "mieDirectionalG" ].value = effectController.mieDirectionalG;
	var theta = Math.PI * ( effectController.inclination - 0.5 );
	var phi = 2 * Math.PI * ( effectController.azimuth - 0.5 );
	sunSphere.position.x = distance * Math.cos( phi );
	sunSphere.position.y = distance * Math.sin( phi ) * Math.sin( theta );
	sunSphere.position.z = distance * Math.sin( phi ) * Math.cos( theta );
	uniforms[ "sunPosition" ].value.copy(sunSphere.position);
//	if ( sun2 !== undefined )
//	    uniforms[ "sunPosition" ].value.copy(sun2.position);
    }
    var gui = new GUI();
    gui.add( effectController, "turbidity", 1.0, 20.0, 0.1 ).onChange( guiChanged );
    gui.add( effectController, "rayleigh", 0.0, 4, 0.001 ).onChange( guiChanged );
    gui.add( effectController, "mieCoefficient", 0.0, 0.1, 0.001 ).onChange( guiChanged );
    gui.add( effectController, "mieDirectionalG", 0.0, 1, 0.001 ).onChange( guiChanged );
    gui.add( effectController, "luminance", 0.0, 2 ).onChange( guiChanged );
    gui.add( effectController, "inclination", 0, 1, 0.0001 ).onChange( guiChanged );
    gui.add( effectController, "azimuth", 0, 1, 0.0001 ).onChange( guiChanged );
    gui.add( effectController, "sun" ).onChange( guiChanged );
    guiChanged();

  // 日蝕用に本当の視直径0.52度に合わせる
  moon2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 30, 20),
    /* x: 緯度0,経度0, y: 北極, z: 緯度0,東経270
       (http://ja.wikipedia.org/wiki/月面座標 */
    new THREE.MeshLambertMaterial({ map: texture })
  );
  moon2.receiveShadow = true;
//  moon2.quaternion = moon0.quaternion;
  scene.add(moon2);
  if ( debug ) {
    helper = new THREE.CameraHelper(camera);
    scenes[0].add(helper);
    moon2.add(new THREE.AxisHelper(0.11));
  }

  sun_light2 = new THREE.DirectionalLight(0xffffff,1.5);
  sun_light2.castShadow = true;
  sun_light2.shadow.mapSize.Width = 512;
  sun_light2.shadow.mapSize.height = 512;
  sun_light2.shadow.camera.near = 0.07;
  sun_light2.shadow.camera.far = 100;
  sun_light2.shadow.camera.left = -0.5;
  sun_light2.shadow.camera.right = 0.5;
  sun_light2.shadow.camera.bottom = -0.5;
  sun_light2.shadow.camera.top = 0.5;
  scene.add(sun_light2);
/*
  // こんな感じにすれば、日中に太陽の光で月が見えないようにできる
  scene.add(new THREE.AmbientLight('blue'));
  scene.fog = new THREE.FogExp2('blue',0.08);
  renderer.setClearColor('blue');

  // こんな感じのやり方で opacityを調節しても出来そう。夕方にも勝手になる。
  // 但し、このままだと、地平線の辺りに隙間が残る
  sky2 = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshLambertMaterial({
      color: 'red', emissive: 'blue', transparent: true, opacity: 0.7 }));
  sky2.position.z = 0.1;
  sky2.rotation.x = Math.PI;
  scene.add(sky2);
*/

  if ( !debug ) {
    var ground2 = new THREE.Mesh(
      new THREE.PlaneGeometry(19,19),
      new THREE.MeshLambertMaterial({ color: 0, emissive: 0x6b4513 }));
    ground2.position.z = -0.07;
    scene.add(ground2);
  }

  earth2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.33, 30, 20),
    new THREE.MeshLambertMaterial({ color: 'white' }));
  earth2.castShadow = true;
  scene.add(earth2);

  sun2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 30, 20),
    new THREE.MeshLambertMaterial(
      { color: 'yellow', emissive: 0xffff40 }));
  scene.add(sun2);

  renderer.shadowMap.enabled = true;
  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  $('#arena2').append(renderer.domElement);
}

function update() {
  if ( animate || unloaded_texture > 0)
    requestAnimationFrame(update);

  for ( var i = 0; i < 2; ++i ) {
    controls[i].update();
    renderers[i].render(scenes[i], cameras[i]);
  }

  if ( debug )
    helper.update();

  renderers[2].render(scenes[2], cameras[2]);
}

function setHandlers() {

  $('#arena0, #arena1').mousedown(function() {
    animate = true;
    update();
  });

  $('#arena0, #arena1').mouseup(function() {
    animate = false;
  });

  $('#arena0, #arena1').on('mousewheel', function() {
    update();
  });

  $('#arena0, #arena1').on('DOMMouseScroll', function() {
    update();
  });

  $('#arena0, #arena1').on('touchstart', function() {
    animate = true;
    update();
  });

  $('#arena0, #arena1, form').on('touchend', function() {
    animate = false;
  });

  $('input').change(function() {
    update();
  });
}

function adjustStyle() {
  var w01 = $('#arena0').width(), h01 = w01*0.8, wh2 = w01*0.3;
  var h02 = document.body.clientHeight*0.5, w02 = h02/0.8, wh2_2 = w02*0.3;
  if ( h01 < h02 ) {
    $('#arena0, #arena1').height(h01);
    $('#arena2, #loading').css({width: wh2, height: wh2, left: -w01*0.1});
  } else {
    $('#arena0, #arena1').height(h02);
    $('#arena0, #arena1').width(w02);
    $('#arena2, #loading').css({width: wh2_2, height: wh2_2, left: -w02*0.1});
  }

  if ( renderers.length > 0 ) {
    renderers[0].setSize(w01, h01);
    cameras[0].aspect = w01/h01;
    cameras[0].updateProjectionMatrix();
    renderers[1].setSize(w01, h01);
    cameras[1].aspect = w01/h01;
    cameras[1].updateProjectionMatrix();
    renderers[2].setSize(wh2, wh2);
    update();
  }
}

function onWindowResize() {
  adjustStyle();
}

$(function() {
  adjustStyle();
  initValues();

  $(window).resize(onWindowResize);
  $('.settings').change(newSettings);

  window.onpopstate = function() { initValues(); newSettings(); update(); }

  unloaded_texture = 2;
  init0();
  init1();
  init2();
  showLabels();

  setHandlers();

  animate = false;
  newSettings();
  update();
});
