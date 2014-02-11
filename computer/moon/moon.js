'use strict';
var debug = false;

var camera, scene, renderer, controls;
var latitude;
var e1 = new THREE.Vector3(1,0,0),
    e2 = new THREE.Vector3(0,1,0),
    e3 = new THREE.Vector3(0,0,1),
    zero = new THREE.Vector3(0,0,0),
    earth_th = 23.4 / 180.0 * Math.PI,
    earth_axis = new THREE.Vector3(0,Math.sin(earth_th),Math.cos(earth_th)),
    sun_trajectory,
    radius = 200;
var celestial; // 天球

/* 赤道上で太陽が南中した時の天頂からの角度。南が正。
   phase は、春分から数えた日を角度に換算したもの */
function getAngle(phase) {
  var pos = e1.clone().applyAxisAngle(earth_axis, phase);
  return Math.asin(pos.z);
}

function newSettings() {
  latitude = $('#latitude').val() / 180.0 * Math.PI;
  celestial.quaternion.setFromAxisAngle(e1, latitude);
  var angle = getAngle($('#date').val()/365.0*2*Math.PI);
  sun_trajectory.scale.set(
    radius * Math.cos(angle), 1, radius * Math.cos(angle));
  sun_trajectory.position.y = -radius * Math.sin(angle);
}

function init() {
  var arena = $('#arena');
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    45, arena.innerWidth() / arena.innerHeight(), 1, 2000);
  camera.position.set(750, 50, 350); // x: 画面手前向き, y: 右向き, z: 上向き
  camera.up = e3.clone();
  camera.lookAt(scene.position);
  controls = new THREE.TrackballControls(camera, arena[0]);
  controls.rotateSpeed = 1.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.noZoom = false;
  controls.noPan = false;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;
  controls.enabled = true;

  scene.add(new THREE.AmbientLight(0x404040));

  celestial = new THREE.Mesh(
    new THREE.SphereGeometry(radius,30,20),
    new THREE.MeshLambertMaterial(
      { color: "blue", transparent: true, opacity: 0.1 }));
  scene.add(celestial);

  var polaris = new THREE.Mesh(        // 天の北極
    new THREE.SphereGeometry(5), 
    new THREE.MeshLambertMaterial({ color: "black"}));
  polaris.position.y = radius;
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
  trajectory.scale.set(radius, 1, radius);
  celestial.add(trajectory);

  // 夏至
  trajectory = circle.clone();
  trajectory.scale.set(
    radius * Math.cos(earth_th), 1, radius * Math.cos(earth_th));
  trajectory.position.y = radius * Math.sin(earth_th)
  celestial.add(trajectory);

  // 冬至
  trajectory = circle.clone();
  trajectory.scale.set(
    radius * Math.cos(earth_th), 1, radius * Math.cos(earth_th));
  trajectory.position.y = -radius * Math.sin(earth_th)
  celestial.add(trajectory);

  // 指定した日の太陽
  sun_trajectory = new THREE.Line(
    geo, new THREE.LineBasicMaterial({ color: 0xff7777, linewidth: 3}));
  celestial.add(sun_trajectory);

  var ground = new THREE.Mesh(
    new THREE.CubeGeometry(600, 600,radius * 1.1),
    new THREE.MeshLambertMaterial(
      { ambient: 0xbbbbbb, color: 0xaa7744, transparent: true, opacity: 0.9 }));
  ground.quaternion.setFromAxisAngle(e1, Math.PI);
  scene.add(ground);
  ground.position.z = -radius*1.1/2;

  var light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0,0,50);
  light.castShadow = true;
  light.shadowMapWidth = 2048;
  light.shadowMapHeight = 2048;
  light.target = ground;
  scene.add(light);

  newSettings();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(arena.innerWidth(), arena.innerHeight());
  renderer.shadowMapEnabled = true;
  $('#arena').append(renderer.domElement);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

$(function() {
  $('.settings').change(newSettings);

  init();
  animate();
});
