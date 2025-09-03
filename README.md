# Glass Note

Una aplicación moderna de bloc de notas con estilo cristal (glass morphism) que utiliza IndexedDB para el almacenamiento local (con fallback a localStorage) y ofrece temas claro y oscuro.

## Características

- ✨ Diseño moderno con efecto cristal (glass morphism)
- 📱 Totalmente responsive para dispositivos móviles y de escritorio
- 💾 Almacenamiento local con IndexedDB (con fallback a localStorage)
- 🔍 Búsqueda de notas por título o contenido
- ⏰ Recordatorios con fecha y hora
- 📝 Editor de texto intuitivo
- 🌗 Tema claro/oscuro con toggle en la esquina superior
- 🎨 Paleta de colores masculina (azul/teal)

## Cómo usar

1. Abre `index.html` en tu navegador web
2. Comienza a crear notas con título y contenido
3. Opcionalmente, establece un recordatorio para la nota
4. Guarda la nota haciendo clic en "Guardar"
5. Busca notas usando la barra de búsqueda en la parte superior
6. Las notas con recordatorios próximos se mostrarán en el panel de notificaciones

## Estructura del proyecto

```
glassnote/
├── index.html
├── style.css
├── script.js
```

## Tecnologías utilizadas

- HTML5
- CSS3 (con efectos de glass morphism)
- JavaScript (ES6+)
- IndexedDB para almacenamiento
- Font Awesome para iconos

## Desarrollo local

Para ejecutar la aplicación localmente:

1. Navega al directorio del proyecto
2. Inicia un servidor web local:
   ```bash
   python3 -m http.server 8000
   ```
3. Abre tu navegador en `http://localhost:8000`

## Funcionalidades

### Crear una nueva nota
1. Haz clic en el botón "Nueva Nota"
2. Escribe un título y contenido
3. Opcionalmente, establece una fecha y hora para el recordatorio
4. Haz clic en "Guardar"

### Buscar notas
1. Escribe en la barra de búsqueda en la parte superior
2. Presiona Enter o haz clic en el ícono de búsqueda
3. Las notas que coincidan con tu búsqueda se mostrarán en la lista

### Tema claro/oscuro

1. Haz clic en el ícono de sol/luna en la esquina superior izquierda
2. El tema se guardará automáticamente en tu navegador
3. La aplicación recordará tu preferencia en futuras visitas

## Personalización

Puedes personalizar el estilo modificando las variables CSS en el archivo `style.css`:

```css
:root {
    --primary: #0077b6;           /* Color principal (azul) */
    --primary-light: #0096c7;     /* Color principal claro */
    --secondary: #005a8d;         /* Color secundario */
    --accent: #48cae4;            /* Color de acento (teal) */
    /* ... más variables */
}
```