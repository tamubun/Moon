'use strict';
var debug = false;

var scenes = [], renderers = [], cameras = [], controls = [];
var e1 = new THREE.Vector3(1,0,0),
    e2 = new THREE.Vector3(0,1,0),
    e3 = new THREE.Vector3(0,0,1),
    zero = new THREE.Vector3(0,0,0),
    earth_th = 23.4 / 180.0 * Math.PI,
    earth_axis = new THREE.Vector3(0,Math.sin(earth_th),Math.cos(earth_th));
var celestial,      // 天球
    sun_trajectory,
    sun,
    cel_radius = 200;
var earth_radius = 200,
    ground, sun_light;

/* 赤道上で太陽が南中した時の天頂からの角度。南が正。
   phase は、春分から数えた日を角度に換算したもの */
function getAngle(phase) {
  var pos = e1.clone().applyAxisAngle(earth_axis, phase);
  return Math.asin(pos.z);
}

function newSettings() {
  var latitude = $('#latitude').val() / 180.0 * Math.PI,
      season_phase = $('#date').val()/365.0*2*Math.PI,
      date_phase,
      angle = getAngle(season_phase);

  celestial.quaternion.setFromAxisAngle(e1, latitude);
  sun_trajectory.scale.set(
    cel_radius * Math.cos(angle), 1, cel_radius * Math.cos(angle));
  sun_trajectory.position.y = -cel_radius * Math.sin(angle);

  /* date_phase は、正午から見た時の一日の位相(天の北極、反時計回り)。
     tan(date_phase) = tan(season_phase) cos(earth_th)
     但し、season_phase = pi/2, 3pi /2 (夏至、冬至)とかで注意
     しないといかんけど、今は、season_phaseが丁度、その値にはならないので
     気にせず突っ切る */
  date_phase = - Math.atan(Math.tan(season_phase) * Math.cos(earth_th));
  if ( season_phase >= Math.PI/2 && season_phase <= Math.PI * 3/2 )
    date_phase -= Math.PI;
  var axis = new THREE.Vector3(0, Math.cos(latitude), Math.sin(latitude)),
      v = new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle)),
      q = new THREE.Quaternion();
  sun.position.set(
    cel_radius * v.x, cel_radius * v.y, cel_radius * v.z);
  q.setFromAxisAngle(axis, -date_phase);
  celestial.quaternion = q.multiply(celestial.quaternion);

  ground.position.set(
    earth_radius * Math.cos(latitude),
    earth_radius * Math.sin(latitude) * Math.sin(earth_th),
    earth_radius * Math.sin(latitude) * Math.cos(earth_th));
  ground.rotation.set(-earth_th, Math.PI/2-latitude, 0);
  sun_light.position.set(
    earth_radius * 1.8 * Math.cos(season_phase),
    earth_radius * 1.8 * Math.sin(season_phase),
    0);
}

function showLabels0() {
  var material = new THREE.MeshBasicMaterial({color: 'black'}),
      text, zenith,
      scene = scenes[0];

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'N', {size:30, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(0, cel_radius+40, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'S', {size:30, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(0, -cel_radius-15, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'E', {size:30, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(cel_radius+30, 0, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'W', {size:30, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(-cel_radius-30, 0, 0.1);
  text.rotation.set(Math.PI, Math.PI, 0);
  scene.add(text);

  zenith = new THREE.Mesh(
    new THREE.SphereGeometry(2),
    material);
  zenith.position.set(0, 0, cel_radius);
  scene.add(zenith);
}

function showLabels1(plane) {
  var material = new THREE.MeshBasicMaterial({color: 'black'}),
      text,
      scene = scenes[1];

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'N', {size:15, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(-earth_radius*0.28, 0, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'S', {size:15, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(earth_radius*0.35, 0, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'E', {size:15, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(0, earth_radius*0.3, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);

  text = new THREE.Mesh(
    new THREE.TextGeometry(
      'W', {size:15, height:0.2, curveSegments: 2, font: 'helvetiker'}),
    material);
  text.position.set(0, -earth_radius*0.37, 0.1);
  text.rotation.z = Math.PI/2;
  plane.add(text);
}

function init0() {
  var arena = $('#arena0'),
      scene = new THREE.Scene(),
      renderer = new THREE.WebGLRenderer({ antialias: true }),
      camera = new THREE.PerspectiveCamera(
        45, arena.innerWidth() / arena.innerHeight(), 1, 2000),
      control = new THREE.TrackballControls(camera, arena[0]);

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

  var polaris = new THREE.Mesh(        // 天の北極
    new THREE.TetrahedronGeometry(8),
    new THREE.MeshLambertMaterial({ color: 'yellow'}));
  polaris.position.y = cel_radius*1.5;
  celestial.add(polaris);
  polaris = polaris.clone();
  polaris.rotation.z = Math.PI/2;
  celestial.add(polaris);

  var material = new THREE.LineBasicMaterial({ color: 0xaaaacc }),
      geo = new THREE.Geometry(),
      trajectory, i, th;

  for ( i = 0; i < 41; ++i ) {
    th = 2*Math.PI / 40 * i;
    geo.vertices.push(new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
  }
  var circle = new THREE.Line(geo, material);

  // 春分、秋分
  trajectory = circle.clone();
  trajectory.scale.set(cel_radius, 1, cel_radius);
  celestial.add(trajectory);

  // 夏至
  trajectory = circle.clone();
  trajectory.scale.set(
    cel_radius * Math.cos(earth_th), 1, cel_radius * Math.cos(earth_th));
  trajectory.position.y = cel_radius * Math.sin(earth_th)
  celestial.add(trajectory);

  // 冬至
  trajectory = circle.clone();
  trajectory.scale.set(
    cel_radius * Math.cos(earth_th), 1, cel_radius * Math.cos(earth_th));
  trajectory.position.y = -cel_radius * Math.sin(earth_th)
  celestial.add(trajectory);

  // 指定した日の太陽の軌跡
  sun_trajectory = new THREE.Line(
    geo, new THREE.LineBasicMaterial({ color: 0xff7777, linewidth: 3}));
  celestial.add(sun_trajectory);

  sun = new THREE.Mesh(
    new THREE.SphereGeometry(cel_radius*0.1, cel_radius*0.1, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'yellow', emissive: 0xffff40 }));
  celestial.add(sun);

  var ground0 = new THREE.Mesh(
    new THREE.CubeGeometry(600, 600,cel_radius * 1.1),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 0xaa7744, transparent: true, opacity: 0.9 }));
  ground0.position.z = -cel_radius*1.1/2;
  scene.add(ground0);

  showLabels0();

  var light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0,0,50);
  light.target = ground0;
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040));

  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  renderer.shadowMapEnabled = true;
  $('#arena0').append(renderer.domElement);
}

function init1() {
  var arena = $('#arena1'),
      scene = new THREE.Scene(),
      renderer = new THREE.WebGLRenderer({ antialias: true }),
      camera = new THREE.PerspectiveCamera(
        45, arena.innerWidth() / arena.innerHeight(), 1, 2000),
      control = new THREE.TrackballControls(camera, arena[0]);

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

  var earth = new THREE.Mesh(
    new THREE.SphereGeometry(earth_radius, 30, 20),
    new THREE.MeshLambertMaterial({ color: 0x123c74 }));
  earth.rotation.x = -earth_th;
  scene.add(earth);

  var polaris = new THREE.Mesh(        // 天の北極
    new THREE.TetrahedronGeometry(8),
    new THREE.MeshLambertMaterial({ color: 'yellow'}));
  polaris.position.set(
    0,
    earth_radius * 1.5 * Math.sin(earth_th),
    earth_radius * 1.5 * Math.cos(earth_th));
  scene.add(polaris);
  polaris = polaris.clone();
  polaris.rotation.z = Math.PI/2;
  scene.add(polaris);

  var material = new THREE.LineBasicMaterial({ color: 0xaaaacc }),
      geo = new THREE.Geometry(),
      trajectory, i, th;

  for ( i = 0; i < 41; ++i ) {
    th = 2*Math.PI / 40 * i;
    geo.vertices.push(new THREE.Vector3(Math.cos(th), Math.sin(th), 0));
  }
  var circle = new THREE.Line(geo, material);

  // 赤道
  trajectory = circle.clone();
  trajectory.scale.set(earth_radius, earth_radius, 1);
  earth.add(trajectory);

  // 北回帰線
  trajectory = circle.clone();
  trajectory.scale.set(
    earth_radius * Math.cos(earth_th), earth_radius * Math.cos(earth_th), 1);
  trajectory.position.z = earth_radius * Math.sin(earth_th);
  earth.add(trajectory);

  // 南回帰線
  trajectory = circle.clone();
  trajectory.scale.set(
    earth_radius * Math.cos(earth_th), earth_radius * Math.cos(earth_th), 1);
  trajectory.position.z = -earth_radius * Math.sin(earth_th);
  earth.add(trajectory);

  // 黄道
  trajectory = circle.clone();
  trajectory.scale.set(
    earth_radius * 1.8, earth_radius * 1.8, 1);
  scene.add(trajectory);

  sun_light = new THREE.DirectionalLight(0xffffff, 1.2);
  sun_light.target = earth;
  scene.add(sun_light);
  scene.add(new THREE.AmbientLight(0x101010));

  var sun1 = new THREE.Mesh(
    new THREE.SphereGeometry(earth_radius*0.1, earth_radius*0.1, 30, 20),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 'yellow', emissive: 0xffff40 }));
  sun1.position = sun_light.position;
  scene.add(sun1);

  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(earth_radius*0.8, earth_radius*0.8),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 0xaa7744, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide }));
  scene.add(ground);

  showLabels1(ground);

  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  renderer.shadowMapEnabled = true;
  $('#arena1').append(renderer.domElement);
}

function animate() {
  requestAnimationFrame(animate);
  for ( var i = 0; i < 2; ++i ) {
    controls[i].update();
    renderers[i].render(scenes[i], cameras[i]);
  }
}

$(function() {
  $('.settings').change(newSettings);

  init0();
  init1();

  newSettings();

  animate();
});
