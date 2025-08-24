'use client'

import { useRef, Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, Center, Environment, Grid, Bounds, useBounds } from '@react-three/drei'
import { Loader2 } from 'lucide-react'
import * as THREE from 'three'

interface ModelProps {
  url: string
}

function Model({ url }: ModelProps) {
  const { scene } = useGLTF(url)
  const bounds = useBounds()
  const { camera } = useThree()
  
  useEffect(() => {
    if (scene) {
      // Reset any previous transformations
      scene.position.set(0, 0, 0)
      scene.scale.set(1, 1, 1)
      scene.rotation.set(0, 0, 0)
      
      // Calculate bounding box and center the model
      const box = new THREE.Box3().setFromObject(scene)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      
      // Center the model
      scene.position.sub(center)
      
      // Calculate scale to fit the model nicely
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 3 / maxDim // Scale to fit within 3 units (larger)
      scene.scale.setScalar(scale)
      
      // Update the scene
      scene.updateMatrixWorld(true)
      
      // Delay the bounds fitting to ensure all transformations are applied
      setTimeout(() => {
        bounds.refresh().clip().fit()
        // Reset camera position after fitting - closer for larger view
        camera.position.set(2.5, 2.5, 2.5)
        camera.lookAt(0, 0, 0)
      }, 100)
    }
    
    // Cleanup function to reset on unmount
    return () => {
      if (scene) {
        scene.position.set(0, 0, 0)
        scene.scale.set(1, 1, 1)
      }
    }
  }, [scene, bounds, camera, url]) // Added url to dependencies to trigger on model change
  
  return <primitive object={scene} />
}

interface ThreeViewerProps {
  glbUrl: string
  className?: string
}

export function ThreeViewer({ glbUrl, className = '' }: ThreeViewerProps) {
  return (
    <div className={`relative w-full h-full bg-muted/20 rounded-lg overflow-hidden ${className}`}>
      <Canvas
        key={glbUrl} // Force re-render when URL changes
        camera={{ position: [2.5, 2.5, 2.5], fov: 20 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <directionalLight position={[-10, -10, -5]} intensity={0.5} />
          <Bounds fit clip observe damping={6} margin={1.2}>
            <Model url={glbUrl} />
          </Bounds>
          <Grid 
            args={[20, 20]} 
            cellSize={1} 
            cellThickness={0.5} 
            cellColor="#6b7280" 
            sectionSize={5} 
            sectionThickness={1} 
            sectionColor="#9ca3af" 
            fadeDistance={30} 
            fadeStrength={1} 
            followCamera={false} 
            infiniteGrid={true} 
          />
          <OrbitControls 
            enablePan={false}
            enableZoom={false}
            enableRotate={true}
            autoRotate={true}
            autoRotateSpeed={2}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.5}
            minDistance={2}
            maxDistance={8}
          />
          <Environment preset="studio" />
        </Suspense>
      </Canvas>
      
      <div className="absolute bottom-2 left-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        Maus zum Drehen
      </div>
    </div>
  )
}

interface ThreeViewerLoadingProps {
  className?: string
}

export function ThreeViewerLoading({ className = '' }: ThreeViewerLoadingProps) {
  return (
    <div className={`relative w-full h-full bg-muted/20 rounded-lg overflow-hidden flex items-center justify-center ${className}`}>
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">3D-Modell wird geladen...</p>
      </div>
    </div>
  )
}

interface ThreeViewerEmptyProps {
  className?: string
}

export function ThreeViewerEmpty({ className = '' }: ThreeViewerEmptyProps) {
  return (
    <div className={`relative w-full h-full bg-muted/20 rounded-lg overflow-hidden flex items-center justify-center ${className}`}>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Kein 3D-Modell verfügbar</p>
      </div>
    </div>
  )
}