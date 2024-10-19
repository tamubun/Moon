'use strict';
import * as THREE from './js/three/build/three.module.js';
import { TrackballControls } from
  './js/three/examples/jsm/controls/TrackballControls.js';
import { Sky } from './js/three/examples/jsm/objects/Sky.js';

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
var celestial,		// 天球。これはarena0専用なので、celestial0としない。
	sun_trajectory, // これもarena0専用。
	ecliptic0,
	moons_path0,
	sun0, moon0,
	cel_radius = 200;
var ground1, earth1, moon1,
	arena1_scale = 200,
	earth_radius = arena1_scale / 2.5,
	sun_light1, moons_path1;
var sun2, earth2, moon2, sun_light2, ground2;

var sky;

const synodic_period = 29.5306;

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

/* ニュートン法でθを求める。0..piの値を返す。

   GPTに教わった方法を応用 */
function findTheta(v, a, sine, tolerance = 5e-5, max_iter = 1000) {
  /* 初期値 theta=0 では、curr_sin = 1で微分が 0 になるので収束しない */
  var theta = Math.PI/4;
  var iter = 0;

  while (iter < max_iter) {
    var rot_vec = v.clone().applyAxisAngle(a, theta);
    var curr_sin = rot_vec.z / Math.sqrt(rot_vec.x**2 + rot_vec.z**2);

    var error = curr_sin - sine;
    if (Math.abs(error) < tolerance)
      break; // 許容誤差内

    // 数値微分
    var d_th = 1e-6;  // 微小変化
    var new_vec = v.clone().applyAxisAngle(a, theta + d_th);
    var new_sin = new_vec.z / Math.sqrt(new_vec.x**2 + new_vec.z**2);
    var deriv = (new_sin - curr_sin) / d_th;

    // ニュートン法で更新
    theta -= error / deriv;

    iter++;
  }
  if (iter >= max_iter )
    console.log('Iter');

  /* rot_vecが変わらないようにしつつ、thetaの範囲を 0..piに入るように調整 */
  while ( theta < 0 )
    theta += Math.PI*2;
  var q = Math.floor(theta/Math.PI/2);
  theta -= q * Math.PI * 2;
  if ( theta >= Math.PI )
    theta = Math.PI*2 - theta;

  return theta;
}

/* .timelikeのラジオボタンによって time, sun-pos(日の出、日の入りなどの角度)
   の一方から他方を定め直し、スライダーの値も書き換える。

   date_phase(timeを書き換えた場合は、それに対応する新しい値)を返す。

   白夜などがある高緯度になるとsun-posからtimeが定められなくなるし、
   定められる状況でもニュートン法が収束しづらくなるので不正確な結果になるが、
   当面ほっとく。

   sun_dir は、赤道、正午のarena0における太陽の方向ベクトル
   (sun_posからdate_phaseを決め直す時でも、変更前の値から決めた sun_dir
   を使うが、気にしない事にする)。 */
function correct_timelike(date_phase, sun_pos, sun_dir_canonical, latitude) {
  var theta;

  if ( $('label[for=time]>span').hasClass('checked') ) {
    var sun_dir = sun_dir_canonical.clone().applyQuaternion(
      celestial.quaternion);

    // 北から南を見た軸回りの太陽の角度(0..360)。日の出: 0, 南中: pi/2, 日の入り:pi
    theta = Math.atan2(sun_dir.z, sun_dir.x);
    if ( theta < 0 )
      theta += 2*Math.PI;

    /* sliderのstep数 1刻みに合わせて四捨五入する */
    var sun_pos = Math.round(theta/Math.PI*180);
    if ( $('#sun-pos').val() != sun_pos ) {
      /* 上の条件を抜くと $('input').change() が再現無く呼ばれて落ちる */
      $('#sun-pos').val(sun_pos).slider('refresh');
    }
  } else {
    var polaris_dir = e2.clone().applyAxisAngle(e1, latitude);
    sun_dir = sun_dir_canonical.clone().applyAxisAngle(e1, latitude);
    /* tan では決められない。日の出(sun_pos=-pi/2)、日の入り(sun_pos=pi/2) どちらも
       tan(sun_pos)が発散してる。
       sin(sun_pos)で決めるようにして、結果を場合分けする。 */
    date_phase = findTheta(sun_dir, polaris_dir.negate(), Math.sin(sun_pos))
    // findThetaは0..piの値を返す
    if ( Math.cos(sun_pos) >= 0 )
      date_phase = -date_phase;

    var time_val = (date_phase + Math.PI)/Math.PI/2 * 24.0;
    /* sliderのstep数 1刻みに合わせて四捨五入する */
    time_val = Math.round(time_val*10) / 10;
    if ( $('#time').val() != time_val ) {
      /* 上の条件を抜くと $('input').change() が再現無く呼ばれて落ちる */
      $('#time').val(time_val).slider('refresh');
    }
  }

  return date_phase;
}

/* .phaselikeのラジオボタンによって lunar-phase-init, moon-phase
   の一方から他方を定め直し、スライダーの値も書き換える。

   lunar_pnase: 月齢を角度にした値、つまり、りゅう座の頭からみた
   月と太陽の角度差([0..2pi]ではない)を返す */
function correct_phaselike(lunar_phase_init, moon_phase, lunar_phase_diff) {
  var lunar_phase;

  if ( $('label[for=lunar-phase-init]>span').hasClass('checked') ) {
    lunar_phase = lunar_phase_init + lunar_phase_diff;
    var w=Math.floor(lunar_phase / (2* Math.PI));
    moon_phase = (lunar_phase - w*2*Math.PI)/2/Math.PI * synodic_period;

    /* sliderのstep数 0.1刻みに合わせて四捨五入する */
    moon_phase = Math.round(moon_phase*10) / 10;
    if ( $('#moon-phase').val() != moon_phase ) {
      /* 上の条件を抜くと $('input').change() が再現無く呼ばれて落ちる */
      $('#moon-phase').val(moon_phase).slider('refresh');
    }
  } else {
    lunar_phase = moon_phase / synodic_period * 2*Math.PI;
    lunar_phase_init = lunar_phase - lunar_phase_diff;
    if ( lunar_phase_init < 0 ) {
      var w = Math.floor(lunar_phase_init / (2*Math.PI));
      lunar_phase_init -= w*2*Math.PI;
    }
    lunar_phase_init = lunar_phase_init / Math.PI * 180;

    /* sliderのstep数 1刻みに合わせて四捨五入する */
    lunar_phase_init = Math.round(lunar_phase_init);
    if ( $('#lunar-phase-init').val() != lunar_phase_init ) {
      /* 上の条件を抜くと $('input').change() が再現無く呼ばれて落ちる */
      $('#lunar-phase-init').val(lunar_phase_init).slider('refresh');
    }
  }

  return lunar_phase;
}

function newSettings() {
  var latitude = $('#latitude').val() / 180.0 * Math.PI,
	  year_phase = $('#date').val()/365.0*2*Math.PI,
	  date_phase = ($('#time').val()-12)/24.0*2*Math.PI, // 12時が 0.0
      sun_pos = $('#sun-pos').val()/ 180.0 * Math.PI,
	  lunar_phase_init = $('#lunar-phase-init').val()/180*Math.PI,
      lunar_phase, lunar_phase_diff,
	  moon_phase = $('#moon-phase').val(),
	  node_phase =	$('#node').val()/180*Math.PI,
	  angles,
	  q = new THREE.Quaternion();

  $('#date-label').text('日付: ' + calcDate(+$('#date').val()));
  year_phase += date_phase/365.0;
  angles = eclipticToGround(e1.clone().applyAxisAngle(e3, year_phase));
  /* 赤道、正午のarena0における太陽の方向 */
  var sun_dir_canonical = new THREE.Vector3(
    0, -Math.sin(angles.th), Math.cos(angles.th));

  /* time と sun-posは、どちらか一方からもう一方を定める。
     sun-posのラジオボタンがcheckedの時には、timeは書き換える。
     逆に、timeがcheckedの時には、sun-posを書き換える */
  date_phase = correct_timelike(
    date_phase, sun_pos, sun_dir_canonical, latitude);

  /* date_phaseが変わるので、year_phase, angles, sun_dir_canonicalを再計算 */
  year_phase = $('#date').val()/365.0*2*Math.PI + date_phase/365.0;
  angles = eclipticToGround(e1.clone().applyAxisAngle(e3, year_phase));
  sun_dir_canonical.set(0, -Math.sin(angles.th), Math.cos(angles.th));

  lunar_phase_diff =
    (+$('#date').val()+($('#time').val()-12)/24.0)/synodic_period*2*Math.PI;

  /* lunar-phase-init と moon-phaseは、どちらか一方からもう一方を定める。
     moon-phaseのラジオボタンがcheckedの時には、lunar-phase-initは書き換える。
     逆に、lunar-phase-initがcheckedの時には、moon-phaseを書き換える */
  lunar_phase =
    correct_phaselike(lunar_phase_init, moon_phase, lunar_phase_diff);

  /* 天球の緯度による傾き */
  celestial.quaternion.setFromAxisAngle(e1, latitude);

  q.setFromAxisAngle(e2, -date_phase);
  /* 日周運動。この一行が無ければarena0の太陽は常に南中している。
     天球にaddされたsun0や黄道、白道等も天球と一緒に日周運動する。
     moon0は天球にaddされてないので、独立して位置計算する。

     quaternionの掛け算の順序が見づらいが、緯度の回転の後に日周運動の回転を掛けるので、
     天球は最初に日周運動で回してから緯度で回した事になる。 */
  celestial.quaternion.multiply(q);
  sun_trajectory.scale.set(
	Math.cos(angles.th) * cel_radius, 1, Math.cos(angles.th) * cel_radius);
  sun_trajectory.position.y = -Math.sin(angles.th) * cel_radius;
  sun0.position.copy(sun_dir_canonical.clone().multiplyScalar(cel_radius));
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
  /* sun1は、sun_light1にaddされてるので、sun1の位置もこれで決まる */
  sun_light1.position.set(
	Math.cos(year_phase) * arena1_scale * 1.8,
	Math.sin(year_phase) * arena1_scale * 1.8,
	0);

  q.setFromAxisAngle(e1, moon_th);
  moons_path1.quaternion.setFromAxisAngle(e3, -node_phase).multiply(q);
  var d = lunar_phase + node_phase + year_phase, // 昇交点と月との黄経差
	  psi,		// 昇交点からの月の軌道上での回転角
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
  /* 赤道、正午のarena0における月の方向 */
  var moon_dir_canonical = new THREE.Vector3(
	Math.cos(moon_angles.th) * Math.sin(moon_angles.phi - angles.phi),
	-Math.sin(moon_angles.th),
	Math.cos(moon_angles.th) * Math.cos(moon_angles.phi - angles.phi));
  /* 指定された緯度、時刻のarena0における月の方向 */
  var moon_dir = moon_dir_canonical.clone().applyQuaternion(
    celestial.quaternion);
  moon0.position.copy(moon_dir.multiplyScalar(cel_radius * 0.95));

  moon2.position.copy(
	moon_dir_canonical.clone().applyQuaternion(
      celestial.quaternion).multiplyScalar(20));
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

  var euler = new THREE.Euler(-Math.PI/2, 0, -Math.PI/2);
  sun2.position.applyEuler(euler);
  sun_light2.position.applyEuler(euler);
  moon2.position.applyEuler(euler);
  q.setFromEuler(euler);
  moon2.quaternion.multiplyQuaternions(q, moon2.quaternion);

  /* Skyは座標系が固定されていて変えられない。(r108で変えられる様になる)
	 (1,0,0) : 北
	 (0,1,0) : 上
	 (0,0,1) : 東
	 sunPositionが (0,0,-1)辺りを向いてる時が日没。
	 その時、カメラが(0,0,-1)辺りを向いてると赤い空が映る。

	 これに合うように、sun2, moon2, 光の向きを
	 回してやらないといけない。
   */
  var uniforms = sky.material.uniforms;
  uniforms[ "sunPosition" ].value.copy(sun2.position);

  cameras[2].lookAt(moon2.position);

  update();
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
	'./js/three/examples/fonts/helvetiker_regular.typeface.json',
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

  // x: 画面手前向き(E), y: 右向き(N), z: 上向き(天頂)
  camera.position.set(850, 50, 400);
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

  var polaris0 = new THREE.Mesh(		// 天の北極
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
  moons_path0 =	 new THREE.Line(
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

  var polaris1 = new THREE.Mesh(		// 天の北極
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
  camera.up = e2.clone();

  sky = new Sky();
  sky.scale.setScalar(450000);
  var uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = 11;
  uniforms['rayleigh'].value = 3;
  uniforms['luminance'].value = 0.8;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.75;
  scene.add(sky);  

  // 日蝕用に本当の視直径0.52度に合わせる
  moon2 = new THREE.Mesh(
	new THREE.SphereGeometry(0.09, 30, 20),
	/* x: 緯度0,経度0, y: 北極, z: 緯度0,東経270
	   (http://ja.wikipedia.org/wiki/月面座標 */
	new THREE.MeshLambertMaterial(
	  { map: texture,
		blending: THREE.CustomBlending,
		blendEquation: THREE.AddEquation,
		blendSrc: THREE.OneMinusDstColorFactor,
		blendDst: THREE.OneFactor,
		premultipliedAlpha: true
	  })
  );
  moon2.receiveShadow = true;
  scene.add(moon2);
  if ( debug ) {
	helper = new THREE.CameraHelper(camera);
	scenes[0].add(helper);
	moon2.add(new THREE.AxisHelper(0.11));
  }

  sun_light2 = new THREE.DirectionalLight(0xffffff,1.0);
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

  if ( !debug ) {
	ground2 = new THREE.Mesh(
	  new THREE.PlaneGeometry(19,19),
	  new THREE.MeshLambertMaterial({ color: 0, emissive: 0x6b4513 }));
	ground2.rotation.set(-Math.PI/2, 0, 0);
	ground2.position.y = -0.07;
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

function textRadioClicked(target) {
  var clicked_span = $('span', target),
      is_timelike = clicked_span.hasClass('timelike'),
      target_class = is_timelike ? '.timelike' : '.phaselike';

  if ( clicked_span.hasClass('checked') )
    return;

  /* sliderをdisable, enableにする方法:
     https://stackoverflow.com/questions/22146702/is-the-a-common-way-to-disable-enable-jquery-mobile-inputs

     JQ Mobile doc (https://api.jquerymobile.com/1.4/slider/#method-disable) の
       slider('disable')
     は、initializeの前には呼べないというエラーで使えなかった */
  $(target_class)
    .removeClass('checked')
    .parent().siblings('div').addClass('ui-state-disabled');
  clicked_span
    .addClass('checked')
    .parent().siblings('div').removeClass('ui-state-disabled');
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

  /* JQ Mobile で、スライダーのフォームに上手くラジオボタンを追加する方法が
     思いつかなかったので、無理矢理テキストでラジオボタンを表示して、
     トグルも自前で実装する。

     いい方法が見つかったら修正したい */
  $('.text-radio').parent().on('click', function(ev) {
    textRadioClicked(ev.target);
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

  /* JQ Mobile 1.4.5 Demoに書いてある input elem に
       disabled='disabled'
     の属性を付けるだけでは、scriptからenableに出来なかったので、
     自前で .text-radio.checked のスライダーだけ enableにする */
  $('.text-radio')
    .parent().siblings('div').addClass('ui-state-disabled');
  $('.text-radio.checked')
    .parent().siblings('div').removeClass('ui-state-disabled');

  animate = false;
  newSettings();
  update();
});
