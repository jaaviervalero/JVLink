# TrailGo — seguidor de rutas GPX / Wikiloc

App web estática (sin backend) para seguir una ruta GPX sobre un mapa y ver tu ubicación GPS en tiempo real.

## Funcionalidad

- Carga automáticamente una ruta de ejemplo (`sample.gpx`, la ruta de Sallent de Gállego – Embalse de Lasarra – Salto de Aguas Limpias exportada desde Wikiloc).
- Botón para subir tu propio archivo `.gpx` (cualquier GPX estándar, incluidos los exportados desde Wikiloc: en la web de Wikiloc pulsa **Descargar → GPX track** y súbelo aquí).
- Muestra la ruta en el mapa (OpenStreetMap) con marcador de inicio y fin.
- Estadísticas: distancia total, desnivel positivo, duración y % de progreso sobre la ruta.
- Botón de ubicación: activa el GPS del dispositivo, muestra tu posición en el mapa y avisa si te desvías más de 60 m de la ruta.
- 100% cliente (HTML/CSS/JS vanilla + Leaflet), no requiere build ni servidor.

## Desarrollo local

```bash
cd gps-tracker
python3 -m http.server 8080
# abre http://localhost:8080
```

## Despliegue

Es un sitio estático puro: sirve el contenido de esta carpeta tal cual.

- **Netlify**: usa el `netlify.toml` en la raíz del repo (`base`/`publish` = `gps-tracker`).
- **Vercel**: al importar el repo, fija el *Root Directory* en `gps-tracker` (framework preset: "Other").

Nota: la geolocalización del navegador (`navigator.geolocation`) solo funciona en `https://` o `localhost`, así que pruébala ya desplegado o en local.
