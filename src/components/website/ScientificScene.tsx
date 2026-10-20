'use client';
import {useEffect,useRef,useState} from 'react';
import type {BufferGeometry,Material,WebGLRenderer} from 'three';
/** Small, lazy GPU scene. No portraits, claims or operational content live here. */
export function ScientificScene({enabled=true}:{enabled?:boolean}){
 const host=useRef<HTMLDivElement>(null),[ready,setReady]=useState(false);
 useEffect(()=>{
  const mounted=host.current;if(!mounted||!enabled)return;
  const element:HTMLDivElement=mounted;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let active=true,generation=0,dispose=()=>{};
  async function start(){
   const version=++generation;dispose();dispose=()=>{};if(reduced.matches)return;
   const THREE=await import('three');if(!active||version!==generation)return;
   let renderer:WebGLRenderer;
   try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return;}
   renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);
   element.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,30),molecule=new THREE.Group();camera.position.z=7;
   scene.add(molecule,new THREE.HemisphereLight(0xffffff,0x163e52,2.8));
   const light=new THREE.DirectionalLight(0xffe4bc,4);light.position.set(3,4,5);scene.add(light);
   const geometry=new THREE.SphereGeometry(.27,20,16),geometries=new Set<BufferGeometry>([geometry]),materials=new Set<Material>();
   const points=[[0,0,0],[1,.7,.2],[-1,.6,-.2],[.4,-1,.3],[-.6,-.85,-.4]];
   points.forEach(([x,y,z],i)=>{const material=new THREE.MeshStandardMaterial({color:i===0?0xdcac68:i%2?0x4a9a8c:0x365b83,roughness:.24,metalness:.2});materials.add(material);const atom=new THREE.Mesh(geometry,material);atom.position.set(x,y,z);atom.scale.setScalar(i===0?1.45:1);molecule.add(atom);});
   points.slice(1).forEach(([x,y,z])=>{const end=new THREE.Vector3(x,y,z),bondGeometry=new THREE.CylinderGeometry(.045,.045,end.length(),10),material=new THREE.MeshStandardMaterial({color:0x91b1bc,roughness:.4});geometries.add(bondGeometry);materials.add(material);const bond=new THREE.Mesh(bondGeometry,material);bond.position.copy(end).multiplyScalar(.5);bond.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.normalize());molecule.add(bond);});
   for(let i=0;i<3;i++){const ringGeometry=new THREE.TorusGeometry(1.65,.015,6,64),material=new THREE.MeshStandardMaterial({color:i===0?0xd8b882:0x77b7ae,transparent:true,opacity:.7});geometries.add(ringGeometry);materials.add(material);const ring=new THREE.Mesh(ringGeometry,material);ring.rotation.set(i*.9,.4+i*.7,0);molecule.add(ring);}
   let frame=0,last=0,visible=true,paused=false,angle=0,targetX=0,targetY=0;
   function schedule(){if(active&&visible&&!document.hidden&&!paused&&!frame)frame=requestAnimationFrame(draw);}
   function draw(time:number){frame=0;if(!active||!visible||document.hidden||paused)return;if(time-last>33){angle+=.008;molecule.rotation.y+=((angle+targetX)-molecule.rotation.y)*.04;molecule.rotation.x+=(targetY-molecule.rotation.x)*.06;molecule.position.y=Math.sin(time*.0006)*.1;renderer.render(scene,camera);last=time;}schedule();}
   const resize=new ResizeObserver(()=>{const size=element.getBoundingClientRect();if(!size.width||!size.height)return;renderer.setSize(size.width,size.height);camera.aspect=size.width/size.height;camera.updateProjectionMatrix();});resize.observe(element);
   const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;if(!visible){cancelAnimationFrame(frame);frame=0;}else schedule();});observer.observe(element);
   const move=(event:PointerEvent)=>{const box=element.getBoundingClientRect();targetX=(event.clientX-box.left)/box.width-0.5;targetY=((event.clientY-box.top)/box.height-.5)*.6;};
   const key=(event:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(event.key)){event.preventDefault();if(event.key===' ')paused=!paused;else if(event.key==='ArrowLeft')angle-=.4;else if(event.key==='ArrowRight')angle+=.4;else targetY+=event.key==='ArrowUp'?-.2:.2;schedule();}};
   element.addEventListener('pointermove',move);element.addEventListener('keydown',key);document.addEventListener('visibilitychange',schedule);setReady(true);schedule();
   dispose=()=>{cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();element.removeEventListener('pointermove',move);element.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',schedule);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  }
  const preference=()=>{setReady(false);void start().catch(()=>{});};
  void start().catch(()=>{});reduced.addEventListener('change',preference);
  return()=>{active=false;generation++;reduced.removeEventListener('change',preference);dispose();};
 },[enabled]);
 return <div ref={host} className={'tale-scientific-scene'+(ready&&enabled?' is-ready':'')} tabIndex={ready&&enabled?0:undefined} role={ready&&enabled?'img':undefined} aria-label={ready&&enabled?'Interactive molecular model. Move your pointer or use arrow keys to rotate. Space pauses motion.':undefined}>{ready&&enabled&&<span>Explore the molecule</span>}</div>;
}
