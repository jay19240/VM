<img src="https://raw.githubusercontent.com/jay19240/Legacy/refs/heads/master/engine/public/textures/logo.png" align="right" width="300">
</br>

## 🕹️ Welcome Girlz and Boyz
**Legacy** is all about building fast, powerful, and creative game experiences, mixing modernity and classic techniques to bridge two worlds: **simplicity** and **flexibility**. If you are excited about **retro-game development**, **old-school Y2K era** you're in the right place.

## 🛠️ The First Web-Based Game Engine Integrated with Blender
**Legacy** is the first web-based game engine offering **native integration with Blender**. One click, that's all it takes to automatically export your entire scene from the world's most popular 3D editor directly into your game, inclusing collider mesh, animated mesh, entity, light, etc...

## 🎨 The Style We Believe In
Inspired by the classic techniques that made retro games legendary, **Legacy Engine** combines:
*   **Arcade physics** for snappy gameplay.
*   **Modern rendering** powered by WebGPU.
*   **A proven graphics pipeline** to create unique experiences like the golden age of video games.

## 🤖 Getting Started
**Legacy** is coming with a default game boilerplate that you can used to start quickly inside it.    
The default game screen is located in `engine/src/game/main.js`.   
We provide too a default scene located in `engine/public/scene.blend`   
Open this file with Blender and install the addon. 
```bash
- Install legacygpu-plugin-blender.zip in File -> Preferences -> Addons
- Set the Engine Path to "engine" folder
- Set the Assets Path to "engine/public" folder
```
Now, follow the instructions to install engine dependencies:
```bash
cd engine
npm install
```
**Congratulation**, your setup is done !

## 🤖 In the futur
- Write documentation
- Add vertex attributes to handle texture tiling transition
- Add a special texture binding to handle texture tiling
- Add a way to handle texture tiling easily directly in Blender plugin
- Add mesh instanciate from Blender
- Add JNM dynamic mesh load with translate and rotation
- Add Tiled support TMX file and Tiled Extension for full binding with Legacy2D
- Add mobile touch event input support
- Add 2D lines collisions system
- Add seamless flag in noise generator
- Add Sprite (JAS & JSS) in Blender

- Add demo of a laser mesh (plan) rotated on the front of camera (and maybe integrate this directly in the engine)
- Add the possibility to create JWM/JNM walker directly in Blender
- Add animation blending in blender

- Add a moving points system https://share.gemini.google/hGI5BpMTLRlw

Fixes:
- Supprime les groupes dans GRF, modifier ça avec une détection d'un flag NOBACK pour gérer les cas de connexion unidirectionel