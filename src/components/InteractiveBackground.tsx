import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

function Particles() {
  const ref = useRef<THREE.Points>(null);
  const { mouse } = useThree();

  // Create a sphere of particles with extra data
  const [positions, initialPositions, randoms] = useMemo(() => {
    const count = 600; // Reduced from 2000 for performance
    const positions = new Float32Array(count * 3);
    const initialPositions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      const r = 1.5 + Math.random() * 0.5;
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      
      initialPositions[i * 3] = x;
      initialPositions[i * 3 + 1] = y;
      initialPositions[i * 3 + 2] = z;
      
      randoms[i] = Math.random();
    }
    return [positions, initialPositions, randoms];
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    
    const time = state.clock.getElapsedTime();
    const posAttr = ref.current.geometry.attributes.position;
    
    for (let i = 0; i < 600; i++) {
      const i3 = i * 3;
      const r = randoms[i];
      
      // Swirling effect: individual rotation speeds
      const swirlSpeed = 0.05 + r * 0.1;
      const angle = time * swirlSpeed + r * Math.PI * 2;
      
      // Pulse effect: individual pulsing
      const pulse = 1 + Math.sin(time * 0.8 + r * 10) * 0.1;
      
      // Base positions
      const x0 = initialPositions[i3];
      const y0 = initialPositions[i3 + 1];
      const z0 = initialPositions[i3 + 2];
      
      // Swirl around Y axis
      const x = x0 * Math.cos(angle) - z0 * Math.sin(angle);
      const z = x0 * Math.sin(angle) + z0 * Math.cos(angle);
      
      // Mouse interaction: particles move away from mouse
      const mx = mouse.x * 2.5;
      const my = mouse.y * 2.5;
      
      const dx = x - mx;
      const dy = y0 - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const push = Math.exp(-dist * 1.5) * 0.6;
      
      posAttr.setXYZ(
        i,
        x * pulse + (dx / (dist + 0.1)) * push,
        y0 * pulse + (dy / (dist + 0.1)) * push,
        z * pulse
      );
    }
    
    posAttr.needsUpdate = true;
    
    // Group rotation for extra dynamism
    ref.current.rotation.x = Math.sin(time * 0.1) * 0.1;
    ref.current.rotation.z = Math.cos(time * 0.1) * 0.1;
  });

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color="#ffffff"
          size={0.015}
          sizeAttenuation={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.6}
        />
      </Points>
    </group>
  );
}

function FloatingGeometry() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { mouse } = useThree();

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime();
      
      // Complex rotation
      meshRef.current.rotation.x = Math.sin(time / 2) * 0.3;
      meshRef.current.rotation.y = Math.cos(time / 3) * 0.3;
      meshRef.current.rotation.z = Math.sin(time / 5) * 0.2;
      
      // Floating movement
      const floatY = Math.sin(time) * 0.1;
      
      // Enhanced parallax
      const targetX = mouse.x * 0.8;
      const targetY = mouse.y * 0.8;
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetX, 0.05);
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY + floatY, 0.05);
      
      // Subtle pulsing scale
      const scale = 1.5 + Math.sin(time * 2) * 0.05;
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef} scale={1.5} castShadow receiveShadow>
      <torusKnotGeometry args={[1, 0.3, 64, 16]} />
      <meshStandardMaterial 
        color="#0055aa" 
        roughness={0.3}
        metalness={0.8}
        transparent 
        opacity={0.5} 
        emissive="#003366"
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

export default function InteractiveBackground() {
  return (
    <div className="absolute inset-0 z-0 h-full w-full bg-background transition-colors duration-700">
      <Canvas shadows={false} camera={{ position: [0, 0, 3], fov: 50 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
        
        <Particles />
        <FloatingGeometry />

        <EffectComposer enableNormalPass={false}>
          <Bloom 
            intensity={1.5} 
            luminanceThreshold={0.2} 
            luminanceSmoothing={0.9} 
            mipmapBlur
          />
        </EffectComposer>

        <OrbitControls 
          enableZoom={false} 
          enablePan={false} 
          enableDamping 
          dampingFactor={0.05}
          rotateSpeed={0.5}
        />
      </Canvas>
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background pointer-events-none transition-colors duration-700" />
    </div>
  );
}
