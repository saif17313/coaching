'use client';
import {useMemo,useRef} from 'react';
import {Canvas,useFrame} from '@react-three/fiber';
import {Float,Sparkles} from '@react-three/drei';
import type {Group,Mesh} from 'three';

/** Signature hero element: electron orbits around the hero portrait (the mentor as the nucleus, a nod to the
 * centre's physics and mathematics focus) with drifting geometric solids. Purely decorative. */
const TEAL='#12a593',NAVY='#1d4f73',GOLD='#d9a75f',MIST='#9fd3c8';
const ORBITS=[{radius:1.75,tilt:[1.15,0,.35],speed:.55,color:TEAL},{radius:2.05,tilt:[.35,.9,-.25],speed:-.42,color:GOLD},{radius:2.35,tilt:[-.55,-.45,.9],speed:.33,color:NAVY}] as const;

function Orbit({radius,tilt,speed,color,phase}:{radius:number;tilt:readonly [number,number,number];speed:number;color:string;phase:number}){
 const electron=useRef<Mesh>(null),angle=useRef(phase);
 useFrame((_,delta)=>{angle.current+=delta*speed;electron.current?.position.set(Math.cos(angle.current)*radius,Math.sin(angle.current)*radius,0);});
 return <group rotation={tilt as unknown as [number,number,number]}>
  <mesh><torusGeometry args={[radius,.012,8,160]}/><meshBasicMaterial color={color} transparent opacity={.55}/></mesh>
  <mesh ref={electron}><sphereGeometry args={[.085,24,16]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} roughness={.2}/></mesh>
 </group>;
}

function Atom({pointer}:{pointer:{current:{x:number;y:number}}}){
 const root=useRef<Group>(null);
 useFrame(state=>{
  if(root.current){
   root.current.rotation.y+=((pointer.current.x*.5)+state.clock.elapsedTime*.08-root.current.rotation.y)*.05;
   root.current.rotation.x+=((-pointer.current.y*.35)-root.current.rotation.x)*.05;
  }
 });
 return <group ref={root}>
  {ORBITS.map((orbit,i)=><Orbit key={i} {...orbit} phase={i*2.1}/>)}
 </group>;
}

function Solids({lite}:{lite:boolean}){
 const shapes=useMemo(()=>[
  {position:[-2.7,1.55,-1] as const,kind:'ico',color:TEAL,speed:1.2},
  {position:[2.75,-1.45,-.6] as const,kind:'oct',color:GOLD,speed:1.5},
  {position:[2.45,1.85,-1.6] as const,kind:'torus',color:'#4f8fb3',speed:1},
  {position:[-2.45,-1.75,-.4] as const,kind:'tetra',color:MIST,speed:1.35},
 ].slice(0,lite?2:4),[lite]);
 return <>{shapes.map((s,i)=><Float key={i} speed={s.speed} rotationIntensity={1.2} floatIntensity={1.4}><mesh position={s.position as unknown as [number,number,number]} scale={.42}>
  {s.kind==='ico'?<icosahedronGeometry args={[1,0]}/>:s.kind==='oct'?<octahedronGeometry args={[1,0]}/>:s.kind==='torus'?<torusGeometry args={[.7,.2,20,48]}/>:<tetrahedronGeometry args={[1,0]}/>}
  {s.kind==='ico'||s.kind==='tetra'?<meshStandardMaterial color={s.color} wireframe transparent opacity={.75}/>:<meshPhysicalMaterial color={s.color} roughness={.25} metalness={.2} clearcoat={.8}/>}
 </mesh></Float>)}</>;
}

export default function HeroScene3D({active,lite,pointer}:{active:boolean;lite:boolean;pointer:{current:{x:number;y:number}}}){
 return <Canvas frameloop={active?'always':'never'} dpr={[1,lite?1.25:1.75]} camera={{position:[0,0,7.2],fov:42}} gl={{alpha:true,antialias:!lite,powerPreference:'low-power'}} aria-hidden="true">
  <ambientLight intensity={.7}/>
  <hemisphereLight args={['#ffffff','#0d3b4a',1.4]}/>
  <directionalLight position={[3,4,5]} intensity={2.6} color="#fff1dc"/>
  <pointLight position={[-4,-2,3]} intensity={18} color={TEAL}/>
  <Atom pointer={pointer}/>
  <Solids lite={lite}/>
  {!lite&&<Sparkles count={70} scale={[7,5,3]} size={2.4} speed={.35} color={GOLD} opacity={.7}/>}
 </Canvas>;
}
