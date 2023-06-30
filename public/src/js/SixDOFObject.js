import * as THREE from '../../node_modules/three/build/three.module.js';
import Torquer from './Torquer.js';

const piOver180 = Math.PI / 180;

// Vehicle Mass Properties (kg, m) - mass Ixx Iyy Izz Ixz
const vehicleMassProperties =
//Cessna 172
[[1043.3,1285.3,1824.9,2666.9,0],
//New Horizons Probe
[401,161.38,402.12,316,0]
// //Boeing 747 on approach, gear up, flaps 20 deg
// [255841,19388193,43792911,61418541,-3023473],
// //Boeing 747 clean aircraft 1
// [288774,24947045,44877565,67112975,-3742057],
// //Boeing 747 clean aircraft 2
// [288774,24675882,44877565,67384138,1315143],
// //Boeing 747 clean aircraft 3
// [288774,24675882,44877565,67384138,-2115076],
// //Boeing 747 clean aircraft 4
// [288774,24675882,44877565,67384138,-474536],
// //F-104 Starfighter
// [7393.5653,4880.9436,79993.2429,81349.0605,0]
];

class SixDOFObject {
  constructor(mass, length, width, height, scene, camera, blockImageOption, massPropOption) {
    this._h = 0.0025;// simulation time step, based on an analysis, _h could
    // be set to as low as 0.0000372 for the Mac Mini with the number of ticks
    // within a 60 fps screen refresh equal to about 448.  _maxTicksPerFrame
    // should be set to well below that.  set _h to well above its limit
    this._maxTicksPerFrame = 10;
    // _h times _maxTicksPerFrame should be be greater than 0.016667
    this._simulationTime = 0;
    this._realTime = 0;
    this._torquer = new Torquer();
    this._torque = new THREE.Vector3(0, 0, 0);
    this._omega = new THREE.Vector3(0, 0, 0);
    this._omegadot = new THREE.Vector3(0, 0, 0);
    this._quat = new THREE.Quaternion();
    this._quatdot = new THREE.Vector4(0, 0, 0, 0);
    this._dcm = new THREE.Matrix4();
    // the reason that _dcm (direction cosine matrix) is a Matrix4 and
    // not a Matrix3 is because the THREE function makeRotationFromQuaternion
    // exists only for Matrix4. We are sometimes forced to convert that to a
    // 3x3 matrix using the THREE function setFromMatrix4.
    this._pos = new THREE.Vector3(0, 0, 0);
    this._vel = new THREE.Vector3(0, 0, 0);
    this._torqueOption = 1;
    // 1 = no torque
    // 2 = space frame torque
    // 3 = body frame torque
    // 4 = acs stabilization
    // 5 = gravity gradient torque
    // 6 = torque on a top
    // 7 = aerodynamic torque
    this._H = new THREE.Vector3(0, 0, 0);
    this._Hinertial = new THREE.Vector3(0, 0, 0);
    this._mat0 = new THREE.Matrix3();
    this._mat1 = new THREE.Matrix3();
    this._euler = new THREE.Euler();
    this._eulerOrder = 'ZYX';
    this._eulerOrderTriplet = {XYZ:[0,1,2],YXZ:[1,0,2],ZXY:[2,0,1],ZYX:[2,1,0],YZX:[1,2,0],XZY:[0,2,1]};
    this._k1 = new THREE.Vector3();
    this._k2 = new THREE.Vector3();
    this._k3 = new THREE.Vector3();
    this._k4 = new THREE.Vector3();
    // 0 = X = phi, 1 = Y = theta, 2 = Z = psi
    // THREE.js uses intrinsic Tait-Bryan angles only, not proper Euler angles
    // nor extrinsic
    this._inertiaMatrix = new THREE.Matrix3();
    this._scale = new THREE.Vector3();
    this._unitScale = new THREE.Vector3();
    this._unitScale.set(1, 1, 1);
    this._T = 0;
    this._T0 = 0;
    this._needsRefresh = true;
    this._showObject = true;
    this._blockMesh = null;
    this._origin = new THREE.Vector3(0,0,0);
    this._itemOrigin = new THREE.Vector3(0,0,0);
    this._offsetItemOrigin = false;
    this._axesOrientation = 'Y Up';
    this._flipQuat = new THREE.Quaternion();
    this._flipQuat.setFromAxisAngle(new THREE.Vector3(1,0,0),0);
    this._flip180quat = new THREE.Quaternion();
    this._flip180quat.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
    this._turn90quat = new THREE.Quaternion(); 
    this._turn90quat.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
    this._xUnitVector = new THREE.Vector3(1, 0, 0);
    this._yUnitVector = new THREE.Vector3(0, 1, 0);
    this._zUnitVector = new THREE.Vector3(0, 0, 1);
    this._q0 = new THREE.Quaternion();
    this._q1 = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._qn = new THREE.Quaternion();
    this._zeroVector = new THREE.Vector3();
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._hQuat = new THREE.Quaternion();
    this._isAxisymmetric = false;
    this._axisOfSymmetry = 0;//1=x, 2=y, 3=z
    this._itemOpacity = 0;
    this._constructionComplete = false;
    this._camera = camera;
    this._scene = scene;
    // this._uvw = new THREE.Vector3();

    if (massPropOption === 'select-an-object'){
      this.setDimensionsAndInertiaProperties(mass, length, width, height);;
    }else{
      this.setPresetMassProperties(massPropOption);
    }

    this.constructBlock(blockImageOption);
    this._determineIfAxisymmetric();
    this.reset();
  }

  shareVectorData(){
    return [this._omega, this._H, this._quat, this._torque];
  }

  sharePaCEphemeralData(){
    return [this._quat, this._simulationTime];
  }

  sharePaCNonEphemeralData(){
    return [this._h, this._omega, this._H, this._inertiaMatrix, 
      (this._torqueOption != 1), this._isAxisymmetric, this._axisOfSymmetry,
      this._origin, this._axesOrientation];
  }

  shareTorqueData(){
    return [this._torque, this._torqueOption, this._omega, this._quat, this._dcm, this._vel, this._h, this._T];
  }

  receiveTorqueData(torque, torqueOption, omega, quat, dcm, vel, h, T){
    this._torque = torque;
    this._torqueOption = torqueOption;
    this._omega = omega;
    this._quat = quat;
    this._dcm = dcm;
    this._vel = vel;
    this._h = h;
    this._T = T;
  }

  // getAeroTorqueData(){
  //   return this._torquer.shareAeroTorqueData();
  // }

  reset(){
    this._dcm.makeRotationFromQuaternion(this._quat);
    this._H.copy(this._omega);
    this._H.applyMatrix3(this._inertiaMatrix);
    this._Hinertial.copy(this._H);
    this._Hinertial.applyQuaternion(this._quat);
    this._v0.copy(this._omega);
    this._v0.applyMatrix3(this._inertiaMatrix);
    this._T = 0.5*this._v0.dot(this._omega);
    this._torquer.receiveTorqueData(...this.shareTorqueData());
    this._torquer.reset();
  }

  tick() {
    let h = this._h;
    let p = this._omega.x;
    let q = this._omega.y;
    let r = this._omega.z;
    let qwdot0 = this._quatdot.w;
    let qxdot0 = this._quatdot.x;
    let qydot0 = this._quatdot.y;
    let qzdot0 = this._quatdot.z;
    let qw = this._quat.w;
    let qx = this._quat.x;
    let qy = this._quat.y;
    let qz = this._quat.z;

    this._quatdot.w = (-p*qx - q*qy - r*qz)/2;
    this._quatdot.x =  (p*qw + r*qy - q*qz)/2;
    this._quatdot.y =  (q*qw - r*qx + p*qz)/2;
    this._quatdot.z =  (r*qw + q*qx - p*qy)/2;
    
    if (h !== 0){
      //trapezoidal integration
      qw += (qwdot0 + this._quatdot.w)*h/2;
      qx += (qxdot0 + this._quatdot.x)*h/2;
      qy += (qydot0 + this._quatdot.y)*h/2;
      qz += (qzdot0 + this._quatdot.z)*h/2;
      this._quat.set(qx, qy, qz, qw);
      this._quat.normalize();
      this._dcm.makeRotationFromQuaternion(this._quat);
    }

    // this._pos.x += this._vel.x * h;
    // this._pos.y += this._vel.y * h;
    // this._pos.z += this._vel.z * h;

    this._H.copy(this._omega);
    this._H.applyMatrix3(this._inertiaMatrix);
    this._Hinertial.copy(this._H);
    this._Hinertial.applyQuaternion(this._quat);
    // console.log(this._Hinertial, this._torque);
    this._needsRefresh = true;
  }

  nullTorque(){
    this._torquer.nullTorque();
  }

  setTorque(torqueOption, torqueMagnitude, x, y, z){
    this._torquer.nullTorque();

    if (torqueOption === 2 || torqueOption === 3){ // body or space frame torque
      const xyz = new THREE.Vector3(x, y, z);
      xyz.normalize();
      xyz.multiplyScalar(torqueMagnitude);
      this._torque.copy(xyz);
      this._torquer.setConstantTorque(this._torque.x, this._torque.y, this._torque.z);
    }
    
    this._torqueOption = torqueOption;
    this._torquer.setTorqueOption(torqueOption);
    this._torquer.receiveTorqueData(...this.shareTorqueData());
    this._torquer.doTorque();
    this.receiveTorqueData(...this._torquer.shareTorqueData());
    this.reset();
    this._needsRefresh = true;
  }

  setPresetMassProperties(option){
    let i = 0;

    switch (option){
      case 'cessna-172':
        this._scale.set(9*0.5, 7*0.5, 4*0.5);
        i = 0;
        break;
      case 'new-horizons':
        this._scale.set(9*0.5, 4*0.5, 6*0.5);
        i = 1;
        break;
      // case 'boeing-747-1':
      //   this._scale.set(9*0.5, 10*0.5, 2*0.5);
      //   i = 2;
      //   break;
      // case 'boeing-747-2':
      //   this._scale.set(9*0.5, 10*0.5, 2*0.5);
      //   i = 3;
      //   break;
      // case 'boeing-747-3':
      //   this._scale.set(9*0.5, 10*0.5, 2*0.5);
      //   i = 4;
      //   break;
      // case 'boeing-747-4':
      //   this._scale.set(9*0.5, 10*0.5, 2*0.5);
      //   i = 5;
      //   break;
      // case 'boeing-747-5':
      //   this._scale.set(9*0.5, 10*0.5, 2*0.5);
      //   i = 6;
      //   break;
      // case 'lockheed-f-104':
      //   this._scale.set(9*0.5, 2*0.5, 1*0.5);
      //   i = 7;
      //   break;
    }

    const [mass, ixx, iyy, izz, ixz] = vehicleMassProperties[i];
    this._mass = mass;
    this._inertiaMatrix.set(ixx, 0, -ixz, 0, iyy, 0, -ixz, 0, izz);
    // this._torquer.setAeroVehicleOption(i);
    // the torquer needs to know the mass for the aero torque option
    // and the moments of inertia for the gravity gradient option
    this._torquer.setMass(mass);
    this._torquer.setInertiaMatrix(ixx, iyy, izz, ixz);
    this._determineIfAxisymmetric();//it isn't but call this to set variables
    this._needsRefresh = true;
  }

  // makeAeroSpaceToWindMatrix(){
  //   this._torquer.makeAeroSpaceToWindMatrix();
  // }

  // setAeroAirspeed(airspeed){
  //   this._torquer.setAeroAirspeed(airspeed);
  // }

  // setInertialVelocity(){
  //   this._torquer.setInertialVelocity();
  // }

  // setAeroAirDensity(airDensity){
  //   this._torquer.setAeroAirDensity(airDensity);
  // }

  // setAeroAzimuth(azimuth){
  //   this._torquer.setAeroAzimuth(azimuth);
  // }

  // setAeroGamma(gamma){
  //   this._torquer.setAeroGamma(gamma);
  // }

  // setAeroThrustMagnitude(thrust){
  //   this._torquer.setAeroThrustMagnitude(thrust);
  // }

  // computeDynamicPressure(){
  //   this._torquer.computeDynamicPressure();
  // }

  tickDynamic(){
    //4th order Runge Kutta
    let h = this._h;
    let pdot, qdot, rdot;
    const elements = this._inertiaMatrix.elements;
    const ixx = elements[0];
    const iyy = elements[4];
    const izz = elements[8];
    const ixy = elements[1];//this seems to work better, but should it be minus?
    const ixz = elements[2];//this seems to work better, but should it be minus?
    const iyz = elements[5];//this seems to work better, but should it be minus?
    let k1 = this._k1;
    let k2 = this._k2;
    let k3 = this._k3;
    let k4 = this._k4;

    //pass 1
    let p = this._omega.x;
    let q = this._omega.y;
    let r = this._omega.z;
    let pdot0 = this._omegadot.x;
    let qdot0 = this._omegadot.y;
    let rdot0 = this._omegadot.z;

    this._torquer.receiveTorqueData(...this.shareTorqueData());
    this._torquer.doTorque();
    this.receiveTorqueData(...this._torquer.shareTorqueData());
    // console.log(this._torque);
    this._v0.copy(this._torque);
// console.log(this._v0.x, this._v0.y, this._v0.z);
    //no check is made if ixx, iyy, or izz is zero
    pdot = -((ixy*(qdot0 - p*r) + ixz*(rdot0 + p*q) + (izz - iyy)*q*r + iyz*(q*q - r*r) - this._v0.x))/ixx;
    qdot = -((iyz*(rdot0 - q*p) + ixy*(pdot0 + q*r) + (ixx - izz)*r*p + ixz*(r*r - p*p) - this._v0.y))/iyy;
    rdot = -((ixz*(pdot0 - r*q) + iyz*(qdot0 + r*p) + (iyy - ixx)*p*q + ixy*(p*p - q*q) - this._v0.z))/izz;
    k1.x = pdot*h;
    k1.y = qdot*h;
    k1.z = rdot*h;

    //pass 2
    p += k1.x/2;
    q += k1.y/2;
    r += k1.z/2;
    pdot0 = pdot;
    qdot0 = qdot;
    rdot0 = rdot;
    pdot = -((ixy*(qdot0 - p*r) + ixz*(rdot0 + p*q) + (izz - iyy)*q*r + iyz*(q*q - r*r) - this._v0.x))/ixx;
    qdot = -((iyz*(rdot0 - q*p) + ixy*(pdot0 + q*r) + (ixx - izz)*r*p + ixz*(r*r - p*p) - this._v0.y))/iyy;
    rdot = -((ixz*(pdot0 - r*q) + iyz*(qdot0 + r*p) + (iyy - ixx)*p*q + ixy*(p*p - q*q) - this._v0.z))/izz;
    k2.x = pdot*h;
    k2.y = qdot*h;
    k2.z = rdot*h;

    //pass 3
    p += k2.x/2;
    q += k2.y/2;
    r += k2.z/2;
    pdot0 = pdot;
    qdot0 = qdot;
    rdot0 = rdot;
    pdot = -((ixy*(qdot0 - p*r) + ixz*(rdot0 + p*q) + (izz - iyy)*q*r + iyz*(q*q - r*r) - this._v0.x))/ixx;
    qdot = -((iyz*(rdot0 - q*p) + ixy*(pdot0 + q*r) + (ixx - izz)*r*p + ixz*(r*r - p*p) - this._v0.y))/iyy;
    rdot = -((ixz*(pdot0 - r*q) + iyz*(qdot0 + r*p) + (iyy - ixx)*p*q + ixy*(p*p - q*q) - this._v0.z))/izz;
    k3.x = pdot*h;
    k3.y = qdot*h;
    k3.z = rdot*h;

    //pass 4
    p += k3.x;
    q += k3.y;
    r += k3.z;
    pdot0 = pdot;
    qdot0 = qdot;
    rdot0 = rdot;
    pdot = -((ixy*(qdot0 - p*r) + ixz*(rdot0 + p*q) + (izz - iyy)*q*r + iyz*(q*q - r*r) - this._v0.x))/ixx;
    qdot = -((iyz*(rdot0 - q*p) + ixy*(pdot0 + q*r) + (ixx - izz)*r*p + ixz*(r*r - p*p) - this._v0.y))/iyy;
    rdot = -((ixz*(pdot0 - r*q) + iyz*(qdot0 + r*p) + (iyy - ixx)*p*q + ixy*(p*p - q*q) - this._v0.z))/izz;
    k4.x = pdot*h;
    k4.y = qdot*h;
    k4.z = rdot*h;

    //total
    this._omega.x += (k1.x + 2*k2.x + 2*k3.x + k4.x)/6;
    this._omega.y += (k1.y + 2*k2.y + 2*k3.y + k4.y)/6;
    this._omega.z += (k1.z + 2*k2.z + 2*k3.z + k4.z)/6;

    this.tick();

    this._v0.copy(this._omega);
    this._v0.applyMatrix3(this._inertiaMatrix);
    this._T = 0.5*this._v0.dot(this._omega);

    if (this._torqueOption === 1){
      // this code helps to correct the omega vector by multiplying
      // 2 or 3 of the components of the angular velocity (omega) by
      // the ratio of the original kinetic energy to the current
      // kinetic energy.  This is only done when there is no torque
      if (this._T0 === 0){
        return;
      }

      let b = this._T/this._T0;

      if (this._axisOfSymmetry === 1){
        this._omega.y /= b;
        this._omega.z /= b;
      }else if (this._axisOfSymmetry === 2){
        this._omega.x /= b;
        this._omega.z /= b;
      }else if (this._axisOfSymmetry === 3){
        this._omega.x /= b;
        this._omega.y /= b;
      }else{
        // maybe don't correct if not axisymmetric?  not sure
        this._omega.x /= b;
        this._omega.y /= b;
        this._omega.z /= b;
      }
    }
  }

  simulate(dt){
    let safetyCounter = 0;
    const maxTicks = this._maxTicksPerFrame;
    this._realTime += dt;
    
    while (this._simulationTime < this._realTime && safetyCounter < maxTicks){
      this.tickDynamic();
      this._simulationTime += this._h;
      safetyCounter++;
    }
  }

  refresh(){
    if (!this._constructionComplete){
      return;
    }
    
    if (this._needsRefresh === false){
      return;
    }

    this._needsRefresh = false;
    this._qn.setFromRotationMatrix(this._camera.matrixWorld);
    this._q0.multiplyQuaternions(this._flipQuat,this._quat);
    this._blockMesh.matrix.compose(this._itemOrigin, this._q0, this._scale);
  }

  setDimensionsAndInertiaProperties(mass, length, width, height){
    this._needsRefresh = true;

    // allow one dimension to be zero but not two or more
    const p1 = length === 0;
    const p2 = width === 0;
    const p3 = height === 0;
    
    if ((p1 && p2) || (p1 && p3) || (p2 && p3)){
      return;
    }
    this._mass = mass;
    const ixx = (width*width + height*height)*mass/12;
    const iyy = (length*length + height*height)*mass/12;
    const izz = (length*length + width*width)*mass/12;
    this._inertiaMatrix.set(ixx, 0, 0, 0, iyy, 0, 0, 0, izz);
    this._torquer.setMass(mass);
    this._torquer.setInertiaMatrix(ixx, iyy, izz);
    this._determineIfAxisymmetric();
    // if a dimension is zero, display it as thin but not precisely zero
    const len = length === 0 ? 0.02 : length;
    const wid = width === 0 ? 0.02 : width;
    const ht = height === 0 ? 0.02 : height;
    this._scale.set(len*0.5, wid*0.5, ht*0.5);
  }

  setOmega(omegaOrH, omegaMagnitude, x, y, z){
    this._needsRefresh = true;
    const xyz = new THREE.Vector3(x, y, z);
    xyz.normalize();

    if (omegaOrH === 'H'){
      // inverse of inertia matrix, it assumes the products of inertia are zero
      let Iinv = new THREE.Matrix3();
      Iinv.elements[0] = 1/(this._inertiaMatrix.elements[0]);
      Iinv.elements[4] = 1/(this._inertiaMatrix.elements[4]);
      Iinv.elements[8] = 1/(this._inertiaMatrix.elements[8]);
      xyz.applyMatrix3(Iinv);
      xyz.normalize();
    }

    xyz.multiplyScalar(omegaMagnitude);
    this._omega = xyz;
    this._H.copy(xyz);
    this._H.applyMatrix3(this._inertiaMatrix);
    this._v1.copy(this._omega);
    this._v1.applyMatrix3(this._inertiaMatrix);
    this._T0 = 0.5*this._v1.dot(this._omega);
    this._determineIfAxisymmetric();
  }

  _determineIfAxisymmetric(){
    const ixx = this._inertiaMatrix.elements[0];
    const iyy = this._inertiaMatrix.elements[4];
    const izz = this._inertiaMatrix.elements[8];
    const xy = ixx === iyy;
    const yz = iyy === izz;
    const xz = ixx === izz;

    if ((xy && yz && xz) || !(xy || yz || xz)){
      this._isAxisymmetric = false;
      this._axisOfSymmetry = 0;//none
      return;
    }

    this._isAxisymmetric = true;

    if (yz){
      this._axisOfSymmetry = 1;//x
    }else if (xz){
      this._axisOfSymmetry = 2;//y
    }else{
      this._axisOfSymmetry = 3;//z
    }
  }

  setOpacity(thing, opacity){  
    if (thing === 'object'){
      this._needsRefresh = true;
      this._itemOpacity = opacity;
      this._blockMesh.material.opacity = opacity;
    }
  }

  constructBlock(blockImageOption) {
    if (this._blockMesh != null){
      this._scene.remove(this._blockMesh);
      this._blockMesh = null;
    }

    const vertices = [
      // Front 1 +Z
      { pos: [-1, -1, 1], norm: [0, 0, 1], uv: [0, 0] }, // 0
      { pos: [1, -1, 1], norm: [0, 0, 1], uv: [0.5, 0] }, // 1
      { pos: [-1, 1, 1], norm: [0, 0, 1], uv: [0, 0.3333333] }, // 2
      { pos: [1, 1, 1], norm: [0, 0, 1], uv: [0.5, 0.3333333] }, // 3
      // Back 6 -Z
      { pos: [1, -1, -1], norm: [0, 0, -1], uv: [0.5, 0.6666666] }, // 8
      { pos: [-1, -1, -1], norm: [0, 0, -1], uv: [0, 0.6666666] }, // 9
      { pos: [1, 1, -1], norm: [0, 0, -1], uv: [0.5, 0.3333333] }, // 10
      { pos: [-1, 1, -1], norm: [0, 0, -1], uv: [0, 0.3333333] }, // 11
      // Left 5 -X
      { pos: [-1, -1, -1], norm: [-1, 0, 0], uv: [0.5, 1] }, // 12
      { pos: [-1, -1, 1], norm: [-1, 0, 0], uv: [0.5, 0.6666666] }, // 13
      { pos: [-1, 1, -1], norm: [-1, 0, 0], uv: [0, 1] }, // 14
      { pos: [-1, 1, 1], norm: [-1, 0, 0], uv: [0, 0.6666666] }, // 15
      // Right 2 +X
      { pos: [1, -1, 1], norm: [1, 0, 0], uv: [0.5, 0] }, // 4
      { pos: [1, -1, -1], norm: [1, 0, 0], uv: [0.5, 0.3333333] }, // 5
      { pos: [1, 1, 1], norm: [1, 0, 0], uv: [1, 0] }, // 6
      { pos: [1, 1, -1], norm: [1, 0, 0], uv: [1, 0.3333333] }, // 7
      // Top 3 +Y
      { pos: [1, 1, -1], norm: [0, 1, 0], uv: [0.5, 0.3333333] }, // 16
      { pos: [-1, 1, -1], norm: [0, 1, 0], uv: [1, 0.3333333] }, // 17
      { pos: [1, 1, 1], norm: [0, 1, 0], uv: [0.5, 0.6666666] }, // 18
      { pos: [-1, 1, 1], norm: [0, 1, 0], uv: [1, 0.6666666] }, // 19
      // Bottom 4 -Y
      { pos: [1, -1, 1], norm: [0, -1, 0], uv: [1, 0.6666666] }, // 20
      { pos: [-1, -1, 1], norm: [0, -1, 0], uv: [0.5, 0.6666666] }, // 21
      { pos: [1, -1, -1], norm: [0, -1, 0], uv: [1, 1] }, // 22
      { pos: [-1, -1, -1], norm: [0, -1, 0], uv: [0.5, 1] }, // 23
    ];
    const numVertices = vertices.length;
    const positionNumComponents = 3;
    const normalNumComponents = 3;
    const uvNumComponents = 2;
    const positions = new Float32Array(numVertices * positionNumComponents);
    const normals = new Float32Array(numVertices * normalNumComponents);
    const uvs = new Float32Array(numVertices * uvNumComponents);
    let posNdx = 0;
    let nrmNdx = 0;
    let uvNdx = 0;

    for (const vertex of vertices) {
      positions.set(vertex.pos, posNdx);
      normals.set(vertex.norm, nrmNdx);
      uvs.set(vertex.uv, uvNdx);
      posNdx += positionNumComponents;
      nrmNdx += normalNumComponents;
      uvNdx += uvNumComponents;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, positionNumComponents)
    );

    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(normals, normalNumComponents)
    );

    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(uvs, uvNumComponents)
    );

    geometry.setIndex([
      0,1,2,2,1,3, // front
      4,5,6,6,5,7, // right
      8,9,10,10,9,11, // back
      12,13,14,14,13,15, // left
      16,17,18,18,17,19, // top
      20,21,22,22,21,23, // bottom
    ]);

    const tl = new THREE.TextureLoader();

    let texture;

    switch (blockImageOption){
      case 'axis-labels':
        texture = tl.load('./src/img/blockFaces.jpg');
        break;
      case 'cessna-172':
        texture = tl.load('./src/img/cessna172.jpg');
        break;
      case 'new-horizons':
        texture = tl.load('./src/img/newHorizons.jpg');
        break;
      // case 'boeing-767':
      //   texture = tl.load('./src/img/cessna172.jpg');
      //   break;
      // case 'lockheed-f-104':
      //   texture = tl.load('./src/img/cessna172.jpg');
      //   break;
    }

    const material = new THREE.MeshPhongMaterial({
      map: texture,
      specular: 0xffffff,
      shininess: 250,
      side: THREE.FrontSide,
      transparent: true,
      opacity: this._itemOpacity,
    });
    
    this._blockMesh = new THREE.Mesh(geometry, material);
    this._blockMesh.castShadow = false;
    this._blockMesh.matrixAutoUpdate = false;

    if (this._showObject){
      this._scene.add(this._blockMesh);
    }

    this._needsRefresh = true;
  }

  setPos(x, y, z) {
    this._itemOrigin.set(x, y, z);
    this._blockMesh.position.set(x, y, z);
  }

  setVel(vx, vy, vz) {
    this._vel.set(vx, vy, vz);
  }

  _setQuaternionFromEulerAngles(){
    this._quat.setFromEuler(this._euler);
  }

  setEulerAngles(angle1, angle2, angle3){
    // angles are entered in degrees
    // set to between -180 and 180 for angles 1 and 3
    this._needsRefresh = true;
    angle1 = angle1 > 180 ? angle1 - 180 : angle1;
    angle3 = angle3 > 180 ? angle3 - 180 : angle3;
    const eo = this._eulerOrderTriplet[this._eulerOrder];
    const angles = [piOver180*angle1, piOver180*angle2, piOver180*angle3];
    this._euler.set(angles[eo[0]],angles[eo[1]],angles[eo[2]], this._eulerOrder);
    this._setQuaternionFromEulerAngles();
  }

  setEulerOrder(order){
    this._eulerOrder = order;
    this._setQuaternionFromEulerAngles();
  }

  setEulerAnglesFromQuaternion(qw, qx, qy, qz){
    this._needsRefresh = true;
    this._q0.set(qx, qy, qz, qw);
    this._q0.normalize();
    this._euler.setFromQuaternion(this._q0, this._eulerOrder);
    this._quat.copy(this._q0);
  }

  getAngularMomentumMagnitude(){
    return this._H.length();
  }

  get pos() {
    return this._pos;
  }

  set pos(value) {
    this._pos = value;
  }

  get vel() {
    return this._vel;
  }

  set vel(value) {
    this._vel = value;
  }

  set mass(value) {
    this._mass = value;
  }

  get omega() {
    return this._omega;
  }

  set omega(value) {
    this._omega = value;
  }

  get blockMesh() {
    return this._blockMesh;
  }

  set3MuOverR3(value){
    this._torquer.set3MuOverR3(value);
  }

  setACSDeadzoneOmega(value){
    this._torquer.setACSDeadzoneOmega(value);
  }

  setACSTorque(value){
    this._torquer.setACSTorque(value);
  }

  setTopXDistance(value){
    this._torquer.setTopXDistance(value);
  }

  setTopGravity(value){
    this._torquer.setTopGravity(value);
  }

  getEulerAngles(){
    this._euler.setFromQuaternion(this._quat, this._eulerOrder);
    const eo = this._eulerOrderTriplet[this._eulerOrder];
    const angles = [(this._euler.x)/piOver180, (this._euler.y)/piOver180, (this._euler.z)/piOver180];

    return [angles[eo[0]],angles[eo[1]],angles[eo[2]]];
  }

  getQuaternionElements(){
    return [this._quat.w, this._quat.x, this._quat.y, this._quat.z];
  }

  syncDCMtoQuat(){
    this._dcm.makeRotationFromQuaternion(this._quat);
  }

  getOmegaMagnitude(){
    return this._omega.length()/piOver180;
  }

  getOmega(){
    const om = [(this._omega.x)/piOver180, (this._omega.y)/piOver180, (this._omega.z)/piOver180];
    return [om[0], om[1], om[2]];
  }

  getMomentsOfInertia(){
    const elements = this._inertiaMatrix.elements;
    const ixx = elements[0];
    const iyy = elements[4];
    const izz = elements[8];

    return [ixx, iyy, izz];
  }

  getKineticEnergy(){
    return this._T;
  }

  showObject(show){
    if (this._showObject === show){
      return;
    }

    this._needsRefresh = true;
    this._showObject = show;

    if (show){
      this._scene.add(this._blockMesh);
    }else{
      this._scene.remove(this._blockMesh);
    }
  }

  setOffsetBooleans(itemOffset){
    this._offsetItemOrigin = itemOffset;
  }

  setOrientation(xyz){
    this._axesOrientation = xyz;
    this._torquer.setAxesOrientation(xyz);
    const x = 6.5;
    const y = 6.5;
    const z = 6.5;

    switch (xyz){
      case 'X Up':
        this._flipQuat.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
        this._origin.set(x, -y, -z);
        break;
      case 'Y Up':
        this._flipQuat.setFromAxisAngle(new THREE.Vector3(1,0,0),0);
        this._origin.set(-x, -y, -z);
        break;
      case 'Z Up':
        this._flipQuat.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
        this._origin.set(-x, -y, z);
        break;
      case 'X Down':
        this._flipQuat.setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2);
        this._origin.set(-x, y, -z);
        break;
      case 'Y Down':
        this._flipQuat.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
        this._origin.set(-x, y, z);
        break;
      case 'Z Down':
        this._flipQuat.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
        this._origin.set(-x, y, -z);
        break;
    }

    this._itemOrigin.copy(this._offsetItemOrigin ? this._origin : this._zeroVector);
  }

  setOrigin(thing, offsetTheOrigin){
    this._needsRefresh = true;

    if (thing === 'object'){
      this._offsetItemOrigin = offsetTheOrigin;
      this._itemOrigin.copy(this._offsetItemOrigin ? this._origin : this._zeroVector);
    }
  }

  set isAxisymmetric(value){
    this._isAxisymmetric = value;
  }
}

export default SixDOFObject;
