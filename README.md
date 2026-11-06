# Tablillas de Sumer

Página divulgativa sobre los mitos sumerios, acadios, babilonios y asirios. Cada mito se puede leer desde tres enfoques:

- **Asiriología**: lo que dice la investigación publicada.
- **Lecturas actuales**: estudios de género, ecocrítica, crítica poscolonial y otras corrientes recientes.
- **Antiguos astronautas**: las teorías de Sitchin, von Däniken y otros autores, siempre acompañadas de la réplica de los especialistas.

Incluye un catálogo de 45 entradas (mitos, deidades y conceptos), una cronología, un mapa de relaciones, fichas de asiriólogos, un glosario y una sección de textos con pasajes comentados y textos completos.

La interfaz y el contenido están en diez idiomas: castellano (original), català, galego, euskara, português, English, asturianu, aragonés, aranés y mirandés. Las nueve traducciones son automáticas y están pendientes de revisión por hablantes nativos; la página lo avisa.

## Los textos antiguos

Los textos completos están solo en castellano. Son traducciones nuevas hechas a partir de ediciones de dominio público. Las ediciones modernas de referencia tienen derechos de autor, por eso no se usan.

| Texto | Edición de partida |
|---|---|
| Enuma Elish | E. A. Wallis Budge, *The Babylonian Legends of the Creation* (1921) |
| Epopeya de Gilgamesh | R. Campbell Thompson, *The Epic of Gilgamish* (1928) |
| Descenso de Ishtar, Adapa, Nergal y Ereshkigal, Atrahasis | R. W. Rogers, *Cuneiform Parallels to the Old Testament* (1912) |
| Diluvio sumerio (Ziusudra), Enki y Ninhursag, Lista Real Sumeria | G. A. Barton, *Archaeology and the Bible* (1916) |
| Etana, Erra e Ishum, Anzu (fragmentos) | M. Jastrow, *The Religion of Babylonia and Assyria* (1898) |

Las seis últimas están marcadas en la página como **traducciones antiguas**. Llevan un aviso visible de que están superadas en muchos puntos, y notas que explican la lectura actual. En todos los textos, las lagunas de las tablillas y lo que han aportado los hallazgos posteriores se resumen con palabras propias.

## Estructura

```
src/template.html   plantilla HTML y estilos
src/app.js          lógica (MesoLogic, funciones puras) e interfaz
data/*.json         datos: catálogo académico, antiguos astronautas, lecturas actuales,
                    asiriólogos, pasajes comentados (textos.json) y textos completos (completos.json)
i18n/<idioma>/      traducciones, en trozos de unos 18 KB (es/ es el original)
build.mjs           genera dist/index.html y dist/i18n/<idioma>.json
tests/              tests de lógica, datos, build, idiomas y navegador
```

No tiene dependencias: basta con Node.js 24.

## Comandos

```sh
node build.mjs                    # construye dist/ (ábrelo con un servidor HTTP: los idiomas se cargan con fetch)
node tests/ejecutar.mjs           # pasa todos los tests y deja dist/ construido
node i18n/extraer.mjs             # regenera i18n/es/ a partir de los datos y la interfaz
node i18n/validar.mjs --todos     # comprueba que todos los idiomas tienen las mismas claves que es/
```

Los tests de navegador necesitan Chrome o Edge. Si no lo encuentran en las rutas habituales, se le puede indicar con la variable `CHROME_PATH`.

Para ver la página en local:

```sh
node build.mjs
npx serve dist        # o cualquier otro servidor estático
```

## Publicación

El flujo `.github/workflows/pages.yml` pasa los tests y el build en cada push y en cada pull request. En cada push a `main` publica además `dist/` en GitHub Pages. Las capturas de los tests de navegador quedan como artefacto de cada ejecución durante siete días.

## Licencia

Todo el proyecto es tan abierto como es posible:

- **Código:** [MIT No Attribution (MIT-0)](LICENSE). Puedes usarlo para lo que quieras, sin obligación de citar.
- **Contenido:** dominio público con [CC0 1.0](LICENSE-CC0.txt). Fichas, traducciones de los textos antiguos, traducciones a otros idiomas y textos de la página. Puedes copiarlo, adaptarlo y publicarlo, también con fines comerciales, sin pedir permiso.

Hay unas pocas excepciones: tres citas breves de obras con derechos de autor, incluidas por derecho de cita. Además, el contenido se ofrece tal cual, sin garantías: es un proyecto divulgativo y puede contener errores. Los detalles y el descargo de responsabilidad completo están en [LICENSE-CONTENIDO.md](LICENSE-CONTENIDO.md).

© 2026 Luis San Juan
