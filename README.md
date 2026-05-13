# El juego de los 45 de Blas

Juego retro multi-pantalla, hecho como regalo de cumpleaños para Blas (45 años).
HTML/CSS/JS sin frameworks. Pensado para móvil vertical, con el primer reto en horizontal.

## Estructura

```
.
├── index.html
├── css/styles.css
├── js/
│   ├── main.js       # máquina de estados de pantallas
│   └── level1.js     # primer reto (reparto estilo Mario Bros)
└── assets/
    ├── blas.png      # imagen de Blas (bienvenida y cara del sprite)
    └── buzon.png     # buzón amarillo de Correos (sprite del enemigo)
```

## Pantallas implementadas

1. **Bienvenida**: imagen de Blas + título "¡Bienvenido al juego de los 45 de Blas!".
2. **Intro**: explicación de la misión (repartir cartas y terminar almorzando en el Casablanca).
3. **Aviso "Gira el móvil"**: el primer reto se juega en horizontal.
4. **Reto 1**: scroller automático estilo Super Mario Bros.
   - Blas avanza solo.
   - Botón **SALTO** (izq) y botón **SOBRE** (dcha) abajo en pantalla.
   - Vecinos salen de las casas gritando "¿Y mi paquete?" → dispararles sobres (+100).
   - Buzones amarillos vienen de derecha a izquierda → esquivar o saltar encima tipo champiñón (+200).
   - Al final del minuto aparece un árbol gigante junto al bar **Casablanca**: hay que saltar a lo más alto.
5. **Éxito**: chiste *"¿Qué hace un pájaro de 100 kilos en una rama? ¡PÍO PÍO!"* y botón al siguiente reto.
6. **Game Over** y **Próximo reto** (placeholder).

## Probar local

Hace falta servir los archivos por HTTP para que el `<img>` y la carga de assets funcionen:

```bash
# Opción 1
python3 -m http.server 8000
# luego abrir http://localhost:8000

# Opción 2
npx serve .
```

Para depurar el nivel 1 en desktop: **espacio** = salto, **X** = disparo.

## Despliegue en GitHub Pages

1. Sube el repo a GitHub.
2. En *Settings → Pages → Build and deployment*, selecciona la rama `main` y carpeta `/ (root)`.
3. Espera ~1 minuto y abre `https://<usuario>.github.io/juego-blas/`.

## Próximos retos

El motor está pensado para añadir más pantallas. Cada reto se enchufa como una nueva sección
`.screen[data-screen="..."]` y un módulo en `js/` que exponga `start()`/`stop()`. Encadénalo en
`js/main.js` añadiendo un nuevo `case` para el botón correspondiente.
