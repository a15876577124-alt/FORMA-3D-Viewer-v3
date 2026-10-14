// Lightweight post-processing. Three tiers: off / passthrough / bloom.
//
// Rendering into a render target disables three's in-shader tone mapping, so when
// the composer is active the tone map happens in OutputPass instead. Result: the
// direct-render path (used on phones with bloom off) and the composer path look
// identical, with no double tone-mapping.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostFX {
  constructor(renderer, scene, camera, caps) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.active = false;
    this.bloomEnabled = false;
    this.width = 1; this.height = 1;

    const canFloat = renderer.extensions.has('EXT_color_buffer_float')
      || renderer.extensions.has('EXT_color_buffer_half_float');
    this.rtType = canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.canFloat = canFloat;

    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: this.rtType,
      samples: caps.antialias ? 4 : 0,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.outputPass = new OutputPass();
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.4, 0.92);

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
    this.bloomPass.enabled = false;
  }

  setSize(width, height, pixelRatio) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(this.width, this.height);
    this.bloomPass.setSize(this.width, this.height);
  }

  configure({ bloom, threshold, strength, radius }) {
    this.bloomEnabled = !!bloom;
    this.bloomPass.enabled = !!bloom;
    this.bloomPass.threshold = threshold;
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
    // No need to allocate render targets when bloom is off - renderer might as
    // well draw straight to the canvas.
    this.active = !!bloom;
  }

  render() {
    if (this.active) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Force a composer render regardless of tier - used right before a screenshot. */
  forceComposer() { this.composer.render(); }

  setCamera(camera) { this.camera = camera; this.renderPass.camera = camera; }

  dispose() {
    this.composer.renderTarget1?.dispose();
    this.composer.renderTarget2?.dispose();
    this.bloomPass.dispose?.();
    this.outputPass.dispose?.();
  }
}
