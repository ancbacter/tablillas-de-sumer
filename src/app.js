/* Tablillas de Sumer: lógica pura (MesoLogic) e interfaz.
   La lógica no toca el DOM y se puede cargar con require() en Node. */
(function (global) {
  'use strict';

  /* ================================================================
     LÓGICA PURA
     ================================================================ */

  var CATEGORIAS = ['mito', 'deidad', 'concepto'];
  var CULTURAS = ['sumeria', 'acadia', 'babilonia', 'asiria'];
  var VISTAS = ['catalogo', 'textos', 'cronologia', 'mapa', 'actual', 'asiriologos', 'autores', 'teorias', 'glosario'];
  var ENFOQUES = ['cientifico', 'astronautas', 'actual', 'comparar'];
  /** Lecturas de una entrada o de un pasaje, en el orden del selector de enfoque. */
  var LECTURAS = ['cientifico', 'astronautas', 'actual'];
  /** Vistas en las que el enfoque cambia lo que se ve (en las demás se oculta el selector). */
  var VISTAS_CON_ENFOQUE = ['catalogo', 'ficha', 'textos', 'texto'];
  var ETAPAS = ['desciframiento', 'clasica', 'actual', 'espana', 'critica'];
  var TIPOS_PASAJE = ['traduccion-dominio-publico', 'cita-breve', 'parafrasis'];
  var TIPOS_OBRA = ['literatura', 'cine', 'serie', 'comic', 'videojuego', 'musica', 'otro'];

  function arr(x) { return Array.isArray(x) ? x : []; }
  function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
  function str(x) {
    if (typeof x === 'string') return x;
    if (typeof x === 'number' && isFinite(x)) return String(x);
    return '';
  }
  function num(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (typeof x === 'string' && x.trim() !== '' && isFinite(Number(x))) return Number(x);
    return null;
  }
  function strs(x) { return arr(x).map(str).filter(function (s) { return s.trim() !== ''; }); }

  /** Minúsculas, sin diacríticos y con espacios colapsados. */
  function normalizar(texto) {
    return str(texto)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Identificador ASCII con guiones, apto para el hash. */
  function slug(texto) {
    return normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escaparHTML(texto) {
    return str(texto).replace(/[&<>"']/g, function (c) { return ESCAPES[c]; });
  }

  /** Solo enlaces http(s); cualquier otra cosa devuelve ''. */
  function urlSegura(url) {
    var u = str(url).trim();
    return /^https?:\/\/[^\s]+$/i.test(u) ? u : '';
  }

  function unicosPorId(lista, mapear) {
    var vistos = Object.create(null);
    var res = [];
    arr(lista).forEach(function (x) {
      if (!x || typeof x !== 'object') return;
      var id = slug(x.id);
      if (!id || vistos[id]) return;
      vistos[id] = true;
      res.push(mapear(x, id));
    });
    return res;
  }

  /** Lista de ids (slug) sin vacíos ni repetidos. */
  function listaIds(x) {
    return strs(x).map(slug).filter(function (v, i, l) { return v && l.indexOf(v) === i; });
  }

  /** Hitos {anio, evento} con año numérico, ordenados por año (orden estable). */
  function hitosOrdenados(lista) {
    return arr(lista).filter(function (h) { return h && typeof h === 'object' && num(h.anio) !== null; })
      .map(function (h) { return { anio: num(h.anio), evento: str(h.evento) }; })
      .sort(function (x, y) { return x.anio - y.anio; });
  }

  function referencias(lista) {
    return arr(lista).filter(function (b) { return b && typeof b === 'object'; }).map(function (b) {
      return { titulo: str(b.titulo), autor: str(b.autor), anio: num(b.anio), url: urlSegura(b.url) };
    }).filter(function (b) { return b.titulo || b.autor; });
  }

  /** Lecturas actuales: {corrientes, entradas, hallazgos, recepcion}. */
  function normalizarActual(raw) {
    var ac = obj(raw);
    return {
      corrientes: unicosPorId(ac.corrientes, function (x, id) {
        return { id: id, nombre: str(x.nombre) || id, descripcion: str(x.descripcion), autores_clave: strs(x.autores_clave) };
      }),
      entradas: unicosPorId(ac.entradas, function (x, id) {
        return { id: id, titulo_actual: str(x.titulo_actual), lectura: str(x.lectura), corrientes: listaIds(x.corrientes), referencias: referencias(x.referencias) };
      }).filter(function (x) { return x.titulo_actual || x.lectura; }),
      hallazgos: arr(ac.hallazgos).filter(function (x) { return x && typeof x === 'object' && num(x.anio) !== null && (str(x.titulo) || str(x.descripcion)); })
        .map(function (x) { return { anio: num(x.anio), titulo: str(x.titulo), descripcion: str(x.descripcion), entradas: listaIds(x.entradas), url: urlSegura(x.url) }; })
        .sort(function (x, y) { return x.anio - y.anio; }),
      recepcion: arr(ac.recepcion).filter(function (x) { return x && typeof x === 'object' && str(x.obra).trim(); })
        .map(function (x) {
          var tipo = normalizar(x.tipo);
          return {
            obra: str(x.obra).trim(), tipo: TIPOS_OBRA.indexOf(tipo) >= 0 ? tipo : 'otro', anio: num(x.anio), autor: str(x.autor),
            descripcion: str(x.descripcion), entradas: listaIds(x.entradas), influencia_sitchin: x.influencia_sitchin === true
          };
        })
        .sort(function (x, y) { return (x.anio === null ? Infinity : x.anio) - (y.anio === null ? Infinity : y.anio); })
    };
  }

  /** Asiriólogos: {autores, hitos}. */
  function normalizarAsiriologos(raw) {
    var as = obj(raw);
    return {
      autores: unicosPorId(as.autores, function (x, id) {
        var etapa = normalizar(x.etapa);
        return {
          id: id, nombre: str(x.nombre) || id, vida: str(x.vida), pais: str(x.pais), institucion: str(x.institucion),
          etapa: ETAPAS.indexOf(etapa) >= 0 ? etapa : '', especialidad: str(x.especialidad), aportaciones: strs(x.aportaciones),
          obras: arr(x.obras).filter(function (o) { return o && typeof o === 'object' && str(o.titulo); })
            .map(function (o) { return { titulo: str(o.titulo), anio: num(o.anio) }; }),
          postura: str(x.postura), entradas: listaIds(x.entradas), url: urlSegura(x.url)
        };
      }),
      hitos: hitosOrdenados(as.hitos)
    };
  }

  /** Textos de los mitos: lista de {id, titulo, version, lengua, ediciones, estructura, pasajes}. */
  function normalizarTextos(raw) {
    return unicosPorId(obj(raw).textos, function (x, id) {
      return {
        id: id, titulo: str(x.titulo) || id, version: str(x.version), lengua: str(x.lengua),
        ediciones: arr(x.ediciones).filter(function (e) { return e && typeof e === 'object' && (str(e.titulo) || str(e.autor)); })
          .map(function (e) { return { titulo: str(e.titulo), autor: str(e.autor), anio: num(e.anio) }; }),
        estructura: arr(x.estructura).filter(function (e) { return e && typeof e === 'object' && (str(e.seccion) || str(e.sinopsis)); })
          .map(function (e) { return { seccion: str(e.seccion), sinopsis: str(e.sinopsis) }; }),
        pasajes: arr(x.pasajes).filter(function (p) { return p && typeof p === 'object' && str(p.texto).trim(); }).map(function (p) {
          var la = obj(p.lectura_astronauta), lc = obj(p.lectura_actual);
          var tipo = normalizar(p.tipo);
          return {
            ref: str(p.ref), tipo: TIPOS_PASAJE.indexOf(tipo) >= 0 ? tipo : '', texto: str(p.texto), fuente: str(p.fuente),
            nota_academica: str(p.nota_academica),
            lectura_astronauta: str(la.lectura).trim() ? { autor: str(la.autor), lectura: str(la.lectura), replica: str(la.replica) } : null,
            lectura_actual: str(lc.lectura).trim() ? { enfoque: str(lc.enfoque), lectura: str(lc.lectura), referencia: str(lc.referencia) } : null
          };
        })
      };
    });
  }

  /**
   * Textos completos (solo en castellano): lista de {id, titulo, subtitulo, fuente, fuente_url, presentacion, tablillas}.
   * Cada tablilla tiene {n, titulo, sinopsis, items}; un item es un verso {n?, v, nota} (n es la línea del original,
   * que no todas las ediciones dan), una laguna {laguna, hoy}, una acotación {acot}, el comienzo de una columna
   * de la tablilla {col} (la numeración vuelve a empezar), un subtítulo de escena {sub} o el epílogo {epilogo}.
   */
  function normalizarCompletos(raw) {
    var textos = obj(obj(raw).textos);
    return Object.keys(textos).map(function (k) {
      var x = obj(textos[k]), id = slug(k);
      if (!id) return null;
      var tablillas = arr(x.tablillas).filter(function (tb) { return tb && typeof tb === 'object'; }).map(function (tb, i) {
        var items = arr(tb.items).map(function (it) {
          it = obj(it);
          if (str(it.v).trim()) return { tipo: 'verso', n: num(it.n), v: str(it.v), nota: str(it.nota) };
          if (str(it.laguna).trim()) return { tipo: 'laguna', texto: str(it.laguna), hoy: str(it.hoy) };
          if (str(it.acot).trim()) return { tipo: 'acot', texto: str(it.acot) };
          if (str(it.col).trim()) return { tipo: 'col', texto: str(it.col) };
          if (str(it.sub).trim()) return { tipo: 'sub', texto: str(it.sub) };
          if (it.epilogo === true) return { tipo: 'epilogo' };
          return null;
        }).filter(Boolean);
        return { n: num(tb.n) === null ? i + 1 : num(tb.n), titulo: str(tb.titulo), sinopsis: str(tb.sinopsis), items: items };
      }).filter(function (tb) { return tb.items.length; });
      // antigua: traducción superada (fragmentaria o con lecturas abandonadas), con un aviso visible.
      return tablillas.length ? {
        id: id, titulo: str(x.titulo) || id, subtitulo: str(x.subtitulo), fuente: str(x.fuente),
        antigua: x.antigua === true, aviso: str(x.aviso),
        fuente_url: /^https?:\/\//.test(str(x.fuente_url)) ? str(x.fuente_url) : '', presentacion: str(x.presentacion), tablillas: tablillas
      } : null;
    }).filter(Boolean);
  }

  var EVIDENCIAS = ['sismologia', 'gravimetria', 'muestras', 'laser', 'geologia', 'radiocarbono', 'imagenes', 'historia', 'textos', 'otra'];
  var ESTADOS_TEORIA = ['refutada', 'sin_pruebas', 'debatida'];

  /** Paso «redondo» (1, 2 o 5 × 10^k) para unas 4–8 marcas en un rango. */
  function pasoEscala(rango) {
    if (!(rango > 0)) return 1;
    var bruto = rango / 6, pot = Math.pow(10, Math.floor(Math.log(bruto) / Math.LN10)), f = bruto / pot;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pot;
  }

  /**
   * Otras teorías (solo castellano): fichas con origen, hitos, autores, afirmaciones con su prueba,
   * una prueba clave con valores numéricos y, opcionalmente, el corte de un interior por capas.
   */
  function normalizarTeorias(raw) {
    return unicosPorId(obj(raw).teorias, function (x, id) {
      var p = obj(x.prueba), int = obj(x.interior);
      var radio = num(int.radio);
      return {
        id: id, nombre: str(x.nombre) || id, lema: str(x.lema), ambito: normalizar(x.ambito),
        estado: ESTADOS_TEORIA.indexOf(normalizar(x.estado)) >= 0 ? normalizar(x.estado) : 'refutada',
        resumen: str(x.resumen), origen: str(x.origen), por_que_atrae: str(x.por_que_atrae), relacion_sumer: str(x.relacion_sumer), veredicto: str(x.veredicto),
        hitos: arr(x.hitos).filter(function (hh) { return hh && num(hh.anio) !== null && str(hh.texto).trim(); })
          .map(function (hh) { return { anio: num(hh.anio), texto: str(hh.texto) }; }).sort(function (a, b) { return a.anio - b.anio; }),
        autores: arr(x.autores).filter(function (a) { return a && str(a.nombre).trim(); })
          .map(function (a) { return { nombre: str(a.nombre), obra: str(a.obra), anio: num(a.anio) }; }),
        afirmaciones: arr(x.afirmaciones).filter(function (a) { return a && str(a.afirmacion).trim() && str(a.replica).trim(); }).map(function (a) {
          var ev = normalizar(a.evidencia);
          return { afirmacion: str(a.afirmacion), autor: str(a.autor), replica: str(a.replica), fuente: str(a.fuente), evidencia: EVIDENCIAS.indexOf(ev) >= 0 ? ev : 'otra' };
        }),
        prueba: str(p.titulo) ? {
          titulo: str(p.titulo), texto: str(p.texto), fuente: str(p.fuente), formato: str(p.formato) === 'anio' ? 'anio' : 'numero',
          valores: arr(p.valores).filter(function (v) { return v && num(v.valor) !== null; })
            .map(function (v) { return { etiqueta: str(v.etiqueta), valor: num(v.valor), tipo: ['teoria', 'medido'].indexOf(str(v.tipo)) >= 0 ? str(v.tipo) : 'referencia' }; })
        } : null,
        interior: radio > 0 ? {
          radio: radio,
          capas: arr(int.capas).filter(function (c) { return c && num(c.hasta) !== null && num(c.desde) !== null && num(c.hasta) > num(c.desde); })
            .map(function (c) { return { nombre: str(c.nombre), hasta: Math.min(num(c.hasta), radio), desde: Math.max(num(c.desde), 0) }; })
        } : null,
        relaciones: arr(x.relaciones).filter(function (r) { return r && slug(r.id); }).map(function (r) { return { id: slug(r.id), tipo: str(r.tipo) }; }),
        enlaces_texto: arr(x.enlaces_texto).filter(function (e) { return e && /^#[a-z0-9-]+$/.test(str(e.href)) && str(e.texto).trim(); })
          .map(function (e) { return { href: str(e.href), texto: str(e.texto) }; }),
        fuentes: arr(x.fuentes).filter(function (f) { return f && (str(f.titulo) || str(f.autor)); })
          .map(function (f) { return { autor: str(f.autor), titulo: str(f.titulo), obra: str(f.obra), anio: num(f.anio), url: urlSegura(f.url) }; })
      };
    });
  }

  /** Posición (0–100 %) de un valor en una escala lineal [min, max], acotada. */
  function posicionEscala(v, min, max) {
    if (!(max > min)) return 0;
    return Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
  }

  /** Versos de un texto completo. */
  function contarVersos(completo) {
    return arr(obj(completo).tablillas).reduce(function (s, tb) {
      return s + arr(tb.items).filter(function (it) { return it.tipo === 'verso'; }).length;
    }, 0);
  }

  /**
   * Limpia y completa los datos de entrada. Nunca lanza.
   * Devuelve { cientifico: {periodos, entradas, glosario}, astronautas: {autores, entradas, cronologia, metodo},
   *            actual: {corrientes, entradas, hallazgos, recepcion}, asiriologos: {autores, hitos}, textos: [] }.
   */
  function normalizarDatos(raw) {
    var r = obj(raw);
    var c = obj(r.cientifico);
    var a = obj(r.astronautas);

    var periodos = unicosPorId(c.periodos, function (p, id) {
      var ini = num(p.inicio), fin = num(p.fin);
      if (ini !== null && fin !== null && ini > fin) { var t = ini; ini = fin; fin = t; }
      return { id: id, nombre: str(p.nombre) || id, inicio: ini, fin: fin, descripcion: str(p.descripcion) };
    });

    var entradas = unicosPorId(c.entradas, function (e, id) {
      var cat = normalizar(e.categoria);
      return {
        id: id,
        nombre: str(e.nombre) || id,
        nombre_original: str(e.nombre_original),
        categoria: CATEGORIAS.indexOf(cat) >= 0 ? cat : '',
        culturas: strs(e.culturas).map(normalizar).filter(function (x, i, l) { return l.indexOf(x) === i; }),
        periodo: slug(e.periodo),
        fecha_texto: str(e.fecha_texto),
        resumen: str(e.resumen),
        interpretacion: str(e.interpretacion),
        detalles: strs(e.detalles),
        fuentes_primarias: strs(e.fuentes_primarias),
        bibliografia: arr(e.bibliografia).filter(function (b) { return b && typeof b === 'object'; }).map(function (b) {
          return { titulo: str(b.titulo), autor: str(b.autor), anio: num(b.anio), url: urlSegura(b.url) };
        }).filter(function (b) { return b.titulo || b.autor; }),
        relaciones: arr(e.relaciones).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) {
          return { id: slug(x.id), tipo: str(x.tipo) };
        }).filter(function (x) { return x.id; })
      };
    });

    var glosario = arr(c.glosario).filter(function (g) { return g && typeof g === 'object' && str(g.termino).trim(); })
      .map(function (g) { return { termino: str(g.termino).trim(), definicion: str(g.definicion) }; })
      .sort(function (x, y) { return normalizar(x.termino) < normalizar(y.termino) ? -1 : normalizar(x.termino) > normalizar(y.termino) ? 1 : 0; });

    var autores = unicosPorId(a.autores, function (au, id) {
      return {
        id: id,
        nombre: str(au.nombre) || id,
        vida: str(au.vida),
        obras: arr(au.obras).filter(function (o) { return o && typeof o === 'object' && str(o.titulo); })
          .map(function (o) { return { titulo: str(o.titulo), anio: num(o.anio) }; }),
        tesis: str(au.tesis),
        formacion: str(au.formacion)
      };
    });

    var entradasAstro = unicosPorId(a.entradas, function (e, id) {
      return {
        id: id,
        titulo_alternativo: str(e.titulo_alternativo),
        autores: strs(e.autores).map(slug).filter(Boolean),
        interpretacion: str(e.interpretacion),
        afirmaciones: arr(e.afirmaciones).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) {
          return { afirmacion: str(x.afirmacion), replica: str(x.replica), fuente_replica: str(x.fuente_replica) };
        }).filter(function (x) { return x.afirmacion || x.replica; }),
        veredicto: str(e.veredicto)
      };
    });

    var cronologia = arr(a.cronologia).filter(function (h) { return h && typeof h === 'object' && num(h.anio) !== null; })
      .map(function (h) { return { anio: num(h.anio), evento: str(h.evento) }; })
      .sort(function (x, y) { return x.anio - y.anio; });

    var m = obj(a.metodo);
    return {
      cientifico: { periodos: periodos, entradas: entradas, glosario: glosario },
      astronautas: {
        autores: autores,
        entradas: entradasAstro,
        cronologia: cronologia,
        metodo: { errores_frecuentes: strs(m.errores_frecuentes), por_que_atrae: str(m.por_que_atrae) }
      },
      actual: normalizarActual(r.actual),
      asiriologos: normalizarAsiriologos(r.asiriologos),
      textos: normalizarTextos(r.textos),
      completos: normalizarCompletos(r.completos),
      teorias: normalizarTeorias(r.teorias)
    };
  }

  /** Mapa id → elemento. */
  function indexarPorId(lista) {
    var mapa = Object.create(null);
    arr(lista).forEach(function (x) { if (x && x.id) mapa[x.id] = x; });
    return mapa;
  }

  /**
   * Texto normalizado en el que se busca para una entrada, su lectura alternativa y su lectura actual
   * (cada una solo si se pasa).
   */
  function textoBuscable(entrada, astro, actual) {
    var e = obj(entrada), a = obj(astro), l = obj(actual);
    var partes = [e.nombre, e.nombre_original, e.resumen, e.interpretacion, e.fecha_texto]
      .concat(arr(e.detalles), arr(e.fuentes_primarias), arr(e.culturas));
    if (astro) {
      partes.push(a.titulo_alternativo, a.interpretacion, a.veredicto);
      arr(a.afirmaciones).forEach(function (x) { partes.push(x && x.afirmacion, x && x.replica); });
    }
    if (actual) partes.push(l.titulo_actual, l.lectura);
    return normalizar(partes.map(str).join(' '));
  }

  /** true si todos los términos de la consulta aparecen en la entrada (sin acentos ni mayúsculas). */
  function coincideTexto(entrada, consulta, astro, actual) {
    var terminos = normalizar(consulta).split(' ').filter(Boolean);
    if (!terminos.length) return true;
    var texto = textoBuscable(entrada, astro, actual);
    return terminos.every(function (t) { return texto.indexOf(t) >= 0; });
  }

  /**
   * Filtra entradas. filtros: { categoria, cultura, periodo, texto, enfoque, soloConAstro }.
   * astroPorId y actualPorId (opcionales): mapas id → lectura alternativa / lectura actual.
   * Se busca en la alternativa salvo con los enfoques 'cientifico' y 'actual', y en la actual salvo con
   * 'cientifico' y 'astronautas'. Devuelve un array nuevo en el orden original.
   */
  function filtrarEntradas(entradas, filtros, astroPorId, actualPorId) {
    var f = obj(filtros);
    var cat = normalizar(f.categoria), cul = normalizar(f.cultura), per = slug(f.periodo);
    var conAstro = f.enfoque !== 'cientifico' && f.enfoque !== 'actual';
    var conActual = f.enfoque !== 'cientifico' && f.enfoque !== 'astronautas';
    var astros = obj(astroPorId), actuales = obj(actualPorId);
    return arr(entradas).filter(function (e) {
      if (!e) return false;
      if (cat && e.categoria !== cat) return false;
      if (cul && arr(e.culturas).indexOf(cul) < 0) return false;
      if (per && e.periodo !== per) return false;
      if (f.soloConAstro && !astros[e.id]) return false;
      return coincideTexto(e, f.texto, conAstro ? astros[e.id] : null, conActual ? actuales[e.id] : null);
    });
  }

  /* ---------------- Lecturas, textos y autores ---------------- */

  /**
   * Columnas de la ficha según el enfoque. disponibles: { astronautas: bool, actual: bool }.
   * 'comparar' devuelve las que tienen contenido (la académica siempre); los demás, solo la suya.
   */
  function columnasFicha(enfoque, disponibles) {
    var d = obj(disponibles);
    var e = enfoqueValido(enfoque);
    if (e !== 'comparar') return [e];
    return LECTURAS.filter(function (l) { return l === 'cientifico' || !!d[l]; });
  }

  /** Lecturas que tiene un pasaje: subconjunto ordenado de LECTURAS. */
  function lecturasDePasaje(pasaje) {
    var p = obj(pasaje);
    var res = [];
    if (str(p.nota_academica).trim()) res.push('cientifico');
    if (p.lectura_astronauta && str(p.lectura_astronauta.lectura).trim()) res.push('astronautas');
    if (p.lectura_actual && str(p.lectura_actual.lectura).trim()) res.push('actual');
    return res;
  }

  /** Pestaña que se abre por defecto: la del enfoque si existe; si no, la académica; si no, la primera. */
  function pestanaInicial(disponibles, enfoque) {
    var d = arr(disponibles);
    if (d.indexOf(enfoque) >= 0) return enfoque;
    if (d.indexOf('cientifico') >= 0) return 'cientifico';
    return d.length ? d[0] : '';
  }

  /** Lecturas que se muestran a la vez: todas en 'comparar'; una (la inicial) en los demás enfoques. */
  function lecturasVisibles(pasaje, enfoque) {
    var d = lecturasDePasaje(pasaje);
    if (enfoque === 'comparar') return d;
    var p = pestanaInicial(d, enfoque);
    return p ? [p] : [];
  }

  /** Asiriólogos cuyo campo `entradas` incluye la entrada `id`. */
  function especialistasDe(autores, id) {
    var k = slug(id);
    return arr(autores).filter(function (a) { return a && arr(a.entradas).indexOf(k) >= 0; });
  }

  /** Agrupa autores por etapa en el orden de ETAPAS; los de etapa desconocida van al final (etapa ''). Sin grupos vacíos. */
  function agruparPorEtapa(autores) {
    var lista = arr(autores).filter(Boolean);
    return ETAPAS.concat(['']).map(function (e) {
      return { etapa: e, autores: lista.filter(function (a) { return (ETAPAS.indexOf(a.etapa) >= 0 ? a.etapa : '') === e; }) };
    }).filter(function (g) { return g.autores.length; });
  }

  /** Obras de la recepción de un tipo ('' = todas). */
  function filtrarRecepcion(recepcion, tipo) {
    var t = normalizar(tipo);
    return arr(recepcion).filter(function (r) { return r && (!t || r.tipo === t); });
  }

  /** Texto de una entrada (mismo id) o null. */
  function textoDeEntrada(textos, id) {
    var k = slug(id);
    return arr(textos).filter(function (x) { return x && x.id === k; })[0] || null;
  }

  /** Posición de un año en una regla [inicio, fin], en porcentaje entre 0 y 100. */
  function posicionEnRango(valor, inicio, fin) {
    var v = num(valor), a = num(inicio), b = num(fin);
    if (v === null || a === null || b === null) return 0;
    if (a === b) return 50;
    var p = (v - a) / (b - a) * 100;
    return Math.round(Math.max(0, Math.min(100, p)) * 100) / 100;
  }

  /**
   * Marcas de una regla temporal: [{anio, pos, nivel, indice}]. pos en % (posicionEnRango); indice = posición en la
   * lista (desde 1); nivel = fila en la que se apila para no pisar a otra marca: dos marcas chocan si están a menos
   * de `separacion` puntos porcentuales o en el mismo año. Se espera la lista ordenada por año.
   */
  function reglaTemporal(items, inicio, fin, separacion) {
    var sep = Math.max(0, num(separacion) || 0);
    var ultimo = [];
    return arr(items).filter(function (x) { return x && num(x.anio) !== null; }).map(function (x, i) {
      var pos = posicionEnRango(x.anio, inicio, fin);
      var nivel = 0;
      while (ultimo[nivel] !== undefined && (pos === ultimo[nivel] || Math.abs(pos - ultimo[nivel]) < sep)) nivel++;
      ultimo[nivel] = pos;
      return { anio: num(x.anio), pos: pos, nivel: nivel, indice: i + 1 };
    });
  }

  /** true si la tecla debe enfocar el buscador: «/» sin modificadores y fuera de un campo editable. */
  function esAtajoBuscar(tecla, opciones) {
    var o = obj(opciones);
    if (tecla !== '/' || o.ctrl || o.meta || o.alt) return false;
    var tag = str(o.etiqueta).toUpperCase();
    return !(o.editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
  }

  /** true si la vista usa el selector de enfoque. */
  function usaEnfoque(vista) { return VISTAS_CON_ENFOQUE.indexOf(vista) >= 0; }

  /** Cuenta entradas por valor de un campo ('categoria', 'periodo') o por cultura. */
  function contar(entradas, campo) {
    var res = Object.create(null);
    arr(entradas).forEach(function (e) {
      var vals = campo === 'culturas' ? arr(e && e.culturas) : [e && e[campo]];
      vals.forEach(function (v) { if (v) res[v] = (res[v] || 0) + 1; });
    });
    return res;
  }

  /**
   * Grafo no dirigido a partir de las relaciones.
   * Ignora ids inexistentes y autorreferencias; une A→B y B→A en una arista.
   * Devuelve { nodos: [{id, nombre, categoria, grado}], aristas: [{origen, destino, tipos: [str]}] }.
   */
  function construirGrafo(entradas, opciones) {
    var op = obj(opciones);
    var lista = arr(entradas).filter(function (e) {
      return e && e.id && (!op.categorias || arr(op.categorias).indexOf(e.categoria) >= 0);
    });
    var porId = indexarPorId(lista);
    var aristas = [];
    var claves = Object.create(null);
    var grado = Object.create(null);
    lista.forEach(function (e) {
      arr(e.relaciones).forEach(function (r) {
        var dest = r && slug(r.id);
        if (!dest || dest === e.id || !porId[dest]) return;
        var a = e.id < dest ? e.id : dest, b = e.id < dest ? dest : e.id;
        var k = a + '\u0000' + b;
        var tipo = str(r.tipo);
        if (claves[k]) {
          if (tipo && claves[k].tipos.indexOf(tipo) < 0) claves[k].tipos.push(tipo);
          return;
        }
        var arista = { origen: a, destino: b, tipos: tipo ? [tipo] : [] };
        claves[k] = arista;
        aristas.push(arista);
        grado[a] = (grado[a] || 0) + 1;
        grado[b] = (grado[b] || 0) + 1;
      });
    });
    var nodos = lista.map(function (e) {
      return { id: e.id, nombre: str(e.nombre) || e.id, categoria: e.categoria || '', grado: grado[e.id] || 0 };
    });
    return { nodos: nodos, aristas: aristas };
  }

  /** Vecinos de un nodo: [{id, tipos}] en ambas direcciones. */
  function vecinos(grafo, id) {
    var res = [];
    arr(obj(grafo).aristas).forEach(function (a) {
      if (a.origen === id) res.push({ id: a.destino, tipos: a.tipos });
      else if (a.destino === id) res.push({ id: a.origen, tipos: a.tipos });
    });
    return res;
  }

  /** Generador pseudoaleatorio determinista (mulberry32). Devuelve una función → [0, 1). */
  function aleatorio(semilla) {
    var s = (num(semilla) || 0) >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Disposición de fuerzas (Fruchterman–Reingold) determinista.
   * opciones: { ancho=800, alto=560, margen=48, semilla=7, iteraciones=400 }.
   * Devuelve { id: {x, y} } con coordenadas que ocupan [margen, ancho-margen] × [margen, alto-margen].
   */
  function disponerGrafo(grafo, opciones) {
    var op = obj(opciones);
    var ancho = num(op.ancho) || 800, alto = num(op.alto) || 560;
    var margen = num(op.margen) !== null ? num(op.margen) : 48;
    var iter = num(op.iteraciones) !== null ? Math.max(0, Math.floor(num(op.iteraciones))) : 400;
    var semilla = num(op.semilla) !== null ? num(op.semilla) : 7;
    var nodos = arr(obj(grafo).nodos);
    var n = nodos.length;
    var res = {};
    if (!n) return res;
    var rand = aleatorio(semilla);
    var cx = ancho / 2, cy = alto / 2;
    var w = Math.max(1, ancho - 2 * margen), hgt = Math.max(1, alto - 2 * margen);
    var idx = Object.create(null);
    var P = nodos.map(function (nd, i) {
      idx[nd.id] = i;
      var ang = 2 * Math.PI * i / n + rand() * 0.5;
      var rad = 0.3 * Math.min(w, hgt) * (0.6 + rand() * 0.4);
      return { x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang), dx: 0, dy: 0 };
    });
    var E = arr(obj(grafo).aristas).map(function (a) { return [idx[a.origen], idx[a.destino]]; })
      .filter(function (p) { return p[0] !== undefined && p[1] !== undefined && p[0] !== p[1]; });
    var k = 0.75 * Math.sqrt(w * hgt / n);
    var temp = Math.min(w, hgt) / 8;
    var enfriar = temp / (iter + 1);
    for (var it = 0; it < iter; it++) {
      var i, j, dx, dy, d, f;
      for (i = 0; i < n; i++) { P[i].dx = 0; P[i].dy = 0; }
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          dx = P[i].x - P[j].x; dy = P[i].y - P[j].y;
          if (dx === 0 && dy === 0) { dx = ((i * 7 + j * 3) % 5) - 2 || 1; dy = ((i * 3 + j * 7) % 5) - 2 || 1; }
          d = Math.sqrt(dx * dx + dy * dy);
          f = (k * k) / d;
          P[i].dx += dx / d * f; P[i].dy += dy / d * f;
          P[j].dx -= dx / d * f; P[j].dy -= dy / d * f;
        }
      }
      E.forEach(function (e) {
        var a = P[e[0]], b = P[e[1]];
        var ex = a.x - b.x, ey = a.y - b.y;
        var ed = Math.sqrt(ex * ex + ey * ey) || 0.01;
        var ef = (ed * ed) / k;
        a.dx -= ex / ed * ef; a.dy -= ey / ed * ef;
        b.dx += ex / ed * ef; b.dy += ey / ed * ef;
      });
      for (i = 0; i < n; i++) {
        var p = P[i];
        p.dx += (cx - p.x) * 0.02 * k / 10;
        p.dy += (cy - p.y) * 0.02 * k / 10;
        var dl = Math.sqrt(p.dx * p.dx + p.dy * p.dy);
        if (dl > 0) {
          var paso = Math.min(dl, temp);
          p.x += p.dx / dl * paso;
          p.y += p.dy / dl * paso;
        }
      }
      temp = Math.max(0.5, temp - enfriar);
    }
    // Encaja el resultado en el rectángulo útil, estirando cada eje por separado:
    // el grafo sale casi redondo y, en un lienzo apaisado, conservar la proporción amontona las etiquetas en el centro.
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    P.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    var sx = maxX - minX, sy = maxY - minY;
    var ex = sx > 0 ? w / sx : 1, ey = sy > 0 ? hgt / sy : 1;
    var ox = margen + (w - sx * ex) / 2, oy = margen + (hgt - sy * ey) / 2;
    nodos.forEach(function (nd, i) {
      res[nd.id] = {
        x: Math.round((ox + (P[i].x - minX) * ex) * 100) / 100,
        y: Math.round((oy + (P[i].y - minY) * ey) * 100) / 100
      };
    });
    return res;
  }

  /**
   * Escala lineal. Devuelve f(valor) → posición, con f.invertir(pos), f.dominio y f.rango.
   * Si el dominio es degenerado, todo se proyecta al centro del rango.
   */
  function escalaLineal(dominio, rango) {
    var d0 = num(arr(dominio)[0]) || 0, d1 = num(arr(dominio)[1]);
    var r0 = num(arr(rango)[0]) || 0, r1 = num(arr(rango)[1]);
    if (d1 === null) d1 = d0;
    if (r1 === null) r1 = r0;
    var f = function (v) {
      if (d1 === d0) return (r0 + r1) / 2;
      return r0 + (num(v) - d0) * (r1 - r0) / (d1 - d0);
    };
    f.invertir = function (p) {
      if (r1 === r0) return (d0 + d1) / 2;
      return d0 + (num(p) - r0) * (d1 - d0) / (r1 - r0);
    };
    f.dominio = [d0, d1];
    f.rango = [r0, r1];
    return f;
  }

  /** Marcas redondas cada `paso` entre inicio y fin (incluidos si caen en múltiplo). */
  function marcasEje(inicio, fin, paso) {
    var a = num(inicio), b = num(fin), p = num(paso);
    if (a === null || b === null || !p || p <= 0) return [];
    if (a > b) { var t = a; a = b; b = t; }
    var res = [];
    for (var v = Math.ceil(a / p) * p; v <= b + 1e-9 && res.length < 1000; v += p) res.push(v);
    return res;
  }

  /**
   * Coloca intervalos en una línea temporal a escala, en carriles sin solapes (incluida la etiqueta).
   * items: [{id, etiqueta, inicio, fin}] (fin opcional = punto).
   * opciones: { pxPorAnio, inicio, fin, margen=24, anchoCaracter=7, separacion=10, minimo=4 }.
   * Devuelve { ancho, carriles, inicio, fin, escala, items: [{id, etiqueta, inicio, fin, x, w, carril}] }.
   */
  function disponerLinea(items, opciones) {
    var op = obj(opciones);
    var validos = arr(items).filter(function (x) { return x && num(x.inicio) !== null; }).map(function (x) {
      var a = num(x.inicio), b = num(x.fin) !== null ? num(x.fin) : a;
      if (a > b) { var t = a; a = b; b = t; }
      return { id: str(x.id), etiqueta: str(x.etiqueta), inicio: a, fin: b, datos: x.datos };
    });
    var margen = num(op.margen) !== null ? num(op.margen) : 24;
    var pxa = num(op.pxPorAnio) || 0.3;
    var cw = num(op.anchoCaracter) || 7;
    var sep = num(op.separacion) !== null ? num(op.separacion) : 10;
    var minimo = num(op.minimo) !== null ? num(op.minimo) : 4;
    var ini = num(op.inicio), fin = num(op.fin);
    if (ini === null) ini = validos.length ? Math.min.apply(null, validos.map(function (x) { return x.inicio; })) : 0;
    if (fin === null) fin = validos.length ? Math.max.apply(null, validos.map(function (x) { return x.fin; })) : ini;
    var ancho = Math.ceil((fin - ini) * pxa + 2 * margen);
    var escala = escalaLineal([ini, fin], [margen, ancho - margen]);
    var finCarril = [];
    var orden = validos.slice().sort(function (x, y) { return x.inicio - y.inicio || x.fin - y.fin; });
    orden.forEach(function (x) {
      x.x = Math.round(escala(x.inicio) * 100) / 100;
      x.w = Math.max(minimo, Math.round((escala(x.fin) - escala(x.inicio)) * 100) / 100);
      var ocupa = Math.max(x.w, x.etiqueta.length * cw);
      var c = 0;
      while (c < finCarril.length && finCarril[c] > x.x) c++;
      finCarril[c] = x.x + ocupa + sep;
      x.carril = c;
    });
    return { ancho: ancho, carriles: finCarril.length, inicio: ini, fin: fin, escala: escala, items: orden };
  }

  /* ---------------- Idiomas y textos de la interfaz ---------------- */

  /** Idiomas de la página, cada uno con su endónimo. El castellano es el original. */
  var IDIOMAS = [
    { codigo: 'es', nombre: 'Castellano' },
    { codigo: 'ca', nombre: 'Català / Valencià' },
    { codigo: 'gl', nombre: 'Galego' },
    { codigo: 'eu', nombre: 'Euskara' },
    { codigo: 'pt', nombre: 'Português' },
    { codigo: 'ast', nombre: 'Asturianu' },
    { codigo: 'an', nombre: 'Aragonés' },
    { codigo: 'oc', nombre: 'Aranés / Occitan' },
    { codigo: 'mwl', nombre: 'Mirandés' },
    { codigo: 'en', nombre: 'English' }
  ];
  var IDIOMA_ORIGINAL = 'es';

  /** Textos de la interfaz en castellano (clave → cadena). Los marcadores {x} se sustituyen al usarlos. */
  var TEXTOS = {
    'ui.sitio.titulo': 'Tablillas de Sumer',
    'ui.portada.antetitulo': 'Sumer · Acad · Babilonia · Asiria',
    'ui.portada.lema_lecturas': 'Los mitos de Mesopotamia en sus textos, leídos por la asiriología, por las corrientes de investigación actuales y por los autores de los antiguos astronautas.',
    'ui.idioma.etiqueta': 'Idioma',
    'ui.nav.aria': 'Secciones',
    'ui.nav.catalogo': 'Catálogo',
    'ui.nav.cronologia': 'Cronología',
    'ui.nav.mapa': 'Mapa',
    'ui.nav.autores': 'Autores',
    'ui.nav.glosario': 'Glosario',
    'ui.enfoque.leyenda': 'Enfoque',
    'ui.enfoque.cientifico': 'Asiriología',
    'ui.enfoque.astronautas': 'Antiguos astronautas',
    'ui.enfoque.comparar': 'Comparar',
    'ui.aviso.global_titulo': 'Teoría sin respaldo académico.',
    'ui.aviso.global_texto': 'Las lecturas de los antiguos astronautas se muestran con fines críticos, siempre con la réplica de los especialistas.',
    'ui.aviso.marginal': 'Teoría sin respaldo académico',
    'ui.aviso.traduccion_automatica': 'Traducción automática, pendiente de revisión por hablantes nativos.',
    'ui.aviso.idioma_error': 'No se ha podido cargar la traducción. La página sigue en el idioma anterior.',
    'ui.pie.texto': 'Las fichas resumen la investigación publicada en asiriología. Las teorías de los antiguos astronautas se incluyen como fenómeno cultural: no forman parte del consenso académico.',
    'ui.fecha.ac': '{n} a. C.',
    'ui.fecha.dc': '{n} d. C.',
    'ui.fecha.circa': 'c. {fecha}',
    'ui.fecha.rango_ac': 'c. {inicio}–{fin} a. C.',
    'ui.fecha.unidad_ac': 'a. C.',
    'ui.categoria.mito': 'Mito',
    'ui.categoria.deidad': 'Deidad',
    'ui.categoria.concepto': 'Concepto',
    'ui.cultura.sumeria': 'Sumeria',
    'ui.cultura.acadia': 'Acadia',
    'ui.cultura.babilonia': 'Babilonia',
    'ui.cultura.asiria': 'Asiria',
    'ui.lista.y': 'y',
    'ui.general.sin_datos': 'No se han cargado datos.',
    'ui.catalogo.entradilla_cientifico': 'Mitos, deidades y conceptos según la asiriología.',
    'ui.catalogo.entradilla_astronautas': 'Las mismas entradas leídas por los autores de los antiguos astronautas, con la réplica de los especialistas.',
    'ui.catalogo.entradilla_comparar_lecturas': 'Cada entrada con su lectura académica y, si existen, la actual y la de los antiguos astronautas.',
    'ui.catalogo.buscar': 'Buscar',
    'ui.catalogo.buscar_ejemplo': 'Enki, diluvio, Nibiru…',
    'ui.catalogo.cultura': 'Cultura',
    'ui.catalogo.categoria': 'Categoría',
    'ui.catalogo.todas_culturas': 'Todas',
    'ui.catalogo.todas_categorias': 'Todas',
    'ui.catalogo.periodo': 'Periodo:',
    'ui.catalogo.quitar_filtro': 'Quitar filtro',
    'ui.catalogo.recuento_uno': '1 entrada',
    'ui.catalogo.recuento_varios': '{n} entradas',
    'ui.catalogo.vacio': 'Ninguna entrada coincide con los filtros.',
    'ui.tarjeta.sello': 'Lectura marginal',
    'ui.tarjeta.sin_alt': 'Sin lectura de los antiguos astronautas.',
    'ui.ficha.titulo': 'Ficha',
    'ui.ficha.entrada': 'Entrada',
    'ui.ficha.col_academica': 'Asiriología',
    'ui.ficha.col_astro': 'Antiguos astronautas',
    'ui.ficha.resumen': 'Resumen',
    'ui.ficha.interpretacion': 'Interpretación',
    'ui.ficha.detalles': 'Detalles',
    'ui.ficha.fuentes': 'Fuentes primarias',
    'ui.ficha.bibliografia': 'Bibliografía',
    'ui.ficha.sin_alt': 'Esta entrada no tiene una lectura de los antiguos astronautas en el corpus.',
    'ui.ficha.aviso_alt': 'Interpretación marginal; cada afirmación lleva debajo la réplica de los especialistas.',
    'ui.ficha.segun': 'Según {autores}',
    'ui.ficha.interpretacion_propuesta': 'Interpretación propuesta',
    'ui.ficha.afirmaciones': 'Afirmaciones y réplicas',
    'ui.ficha.afirmacion': 'Afirmación',
    'ui.ficha.replica': 'Réplica',
    'ui.ficha.sin_replica': 'Sin réplica registrada.',
    'ui.ficha.veredicto': 'Veredicto',
    'ui.ficha.no_encontrada': 'Entrada no encontrada',
    'ui.ficha.no_encontrada_texto': 'No hay ninguna entrada con el identificador «{id}».',
    'ui.ficha.volver': 'Volver al catálogo',
    'ui.ficha.lectura_academica': 'Lectura académica:',
    'ui.ficha.ver_comparadas': 'verlas en paralelo',
    'ui.ficha.existe_alt': 'Existe una lectura de los antiguos astronautas.',
    'ui.ficha.comparar': 'Compararla',
    'ui.ficha.periodo': 'Periodo',
    'ui.ficha.datacion': 'Datación',
    'ui.ficha.relaciones': 'Relaciones',
    'ui.cronologia.entradilla': 'Periodos dibujados a escala real. Pulsa uno para ver sus entradas en el catálogo.',
    'ui.cronologia.sin_periodos': 'No hay periodos con fechas.',
    'ui.cronologia.aria_antigua': 'Periodos de Mesopotamia a escala, de {inicio} a {fin}',
    'ui.cronologia.aria_periodo': '{nombre}, {rango}, {entradas}. Filtrar el catálogo.',
    'ui.cronologia.region_antigua': 'Cronología antigua, desplazable',
    'ui.cronologia.pista': 'Desliza la cronología en horizontal.',
    'ui.cronologia.ver_uno': 'Ver 1 entrada',
    'ui.cronologia.ver_varios': 'Ver {n} entradas',
    'ui.cronologia.moderna_titulo': 'La otra cronología: 1968 en adelante',
    'ui.cronologia.moderna_aviso': 'Hitos de una corriente editorial y televisiva, no de la investigación.',
    'ui.cronologia.aria_moderna': 'Hitos de los antiguos astronautas entre {inicio} y {fin}. La lista sigue a continuación.',
    'ui.cronologia.region_moderna': 'Cronología moderna, desplazable',
    'ui.mapa.titulo': 'Mapa de relaciones',
    'ui.mapa.entradilla': 'Deidades, mitos y conceptos unidos por sus relaciones en los textos. Pulsa un nodo para abrir su ficha.',
    'ui.mapa.con_alt': 'con lectura marginal',
    'ui.mapa.leyenda_alt': 'Tiene lectura marginal',
    'ui.mapa.region': 'Mapa de relaciones, desplazable',
    'ui.mapa.vacio': 'No hay entradas.',
    'ui.mapa.nota': '{aristas} relaciones entre {nodos} entradas.',
    'ui.autores.titulo': 'Autores de los antiguos astronautas',
    'ui.autores.aviso': 'Ninguno de estos autores publica en revistas de asiriología ni lee las lenguas que cita.',
    'ui.autores.formacion': 'Formación',
    'ui.autores.tesis': 'Tesis',
    'ui.autores.vacio': 'No hay autores en los datos.',
    'ui.autores.metodo': 'Cómo evaluar estas afirmaciones',
    'ui.autores.errores': 'Errores frecuentes',
    'ui.autores.atrae': 'Por qué atrae',
    'ui.glosario.filtrar': 'Filtrar términos',
    'ui.glosario.vacio': 'Sin resultados.',
    // Versión 2: navegación, buscador y tercer enfoque.
    'ui.nav.textos': 'Textos',
    'ui.nav.actual': 'Lecturas actuales',
    'ui.nav.asiriologos': 'Asiriólogos',
    'ui.nav.menu': 'Menú',
    'ui.buscar.boton': 'Buscar en el catálogo',
    'ui.buscar.atajo': 'Pulsa / para buscar',
    'ui.enfoque.actual': 'Lecturas actuales',
    'ui.enfoque.desc_cientifico': 'Lo que dice la investigación publicada.',
    'ui.enfoque.desc_astronautas': 'Teorías marginales, cada una con la réplica de los especialistas.',
    'ui.enfoque.desc_actual': 'Las preguntas de las corrientes de investigación recientes.',
    'ui.enfoque.desc_comparar': 'Todas las lecturas disponibles, una al lado de otra.',
    'ui.catalogo.entradilla_actual': 'Las mismas entradas leídas desde los estudios de género, la ecocrítica, la crítica poscolonial y otras corrientes recientes.',
    'ui.tarjeta.sello_actual': 'Lectura actual',
    'ui.tarjeta.sin_actual': 'Sin lectura actual en el corpus.',
    'ui.ficha.col_actual': 'Lecturas actuales',
    'ui.ficha.sin_actual': 'Esta entrada no tiene todavía una lectura actual en el corpus.',
    'ui.ficha.corrientes': 'Corrientes',
    'ui.ficha.referencias': 'Referencias',
    'ui.ficha.lectura': 'Lectura',
    'ui.ficha.existe_actual': 'Hay una lectura actual de esta entrada.',
    'ui.ficha.ver_actual': 'Verla',
    'ui.ficha.especialistas': 'Especialistas',
    'ui.ficha.leer_texto': 'Leer el texto',
    'ui.textos.entradilla': 'Pasajes de los mitos con su fuente y sus lecturas: la académica, la de los antiguos astronautas (con su réplica) y la de la investigación actual.',
    'ui.textos.vacio': 'Todavía no hay textos publicados. Esta sección se completará cuando estén revisados.',
    'ui.textos.pasajes_uno': '1 pasaje',
    'ui.textos.pasajes_varios': '{n} pasajes',
    'ui.textos.indice': 'Índice',
    'ui.textos.estructura': 'Estructura',
    'ui.textos.pasajes': 'Pasajes',
    'ui.textos.ediciones': 'Ediciones de referencia',
    'ui.textos.version': 'Versión',
    'ui.textos.lengua': 'Lengua',
    'ui.textos.fuente': 'Fuente',
    'ui.textos.lecturas': 'Lecturas del pasaje',
    'ui.textos.nota_academica': 'Nota académica',
    'ui.textos.sin_lecturas': 'Este pasaje no tiene lecturas registradas.',
    'ui.textos.no_encontrado': 'Texto no encontrado',
    'ui.textos.no_encontrado_texto': 'No hay ningún texto con el identificador «{id}».',
    'ui.textos.volver': 'Volver a los textos',
    'ui.textos.ficha': 'Ficha de la entrada',
    'ui.nav.teorias': 'Otras teorías',
    'ui.teorias.entradilla': 'El mismo método aplicado a otras teorías del entorno de los antiguos astronautas: qué sostienen, quién las propuso y qué dicen las pruebas.',
    'ui.teorias.vacio': 'Todavía no hay teorías publicadas.',
    'ui.teorias.nota_idioma': 'Las fichas de esta sección solo están en castellano por ahora.',
    'ui.teorias.no_encontrada': 'Teoría no encontrada',
    'ui.teorias.volver': 'Volver a las teorías',
    'ui.teorias.estado_refutada': 'Refutada',
    'ui.teorias.estado_sin_pruebas': 'Sin pruebas',
    'ui.teorias.estado_debatida': 'En debate',
    'ui.teorias.n_afirmaciones': 'Afirmaciones: {n}',
    'ui.teorias.desde': 'Desde {anio}',
    'ui.teorias.veredicto': 'Veredicto',
    'ui.teorias.origen': 'Origen de la teoría',
    'ui.teorias.afirmaciones': 'Afirmación y prueba',
    'ui.teorias.prueba_clave': 'La prueba clave',
    'ui.teorias.por_que_atrae': 'Por qué atrae',
    'ui.teorias.relacion_sumer': 'Relación con Mesopotamia',
    'ui.teorias.fuentes': 'Fuentes',
    'ui.teorias.ev_sismologia': 'Sismología',
    'ui.teorias.ev_gravimetria': 'Gravimetría',
    'ui.teorias.ev_muestras': 'Muestras de roca',
    'ui.teorias.ev_laser': 'Telemetría láser',
    'ui.teorias.ev_geologia': 'Geología',
    'ui.teorias.ev_radiocarbono': 'Radiocarbono',
    'ui.teorias.ev_imagenes': 'Imágenes',
    'ui.teorias.ev_historia': 'Historia',
    'ui.teorias.ev_textos': 'Textos antiguos',
    'ui.teorias.ev_otra': 'Otras pruebas',
    'ui.teorias.km': 'hasta {n} km del centro',
    'ui.teorias.corte_aria': 'Corte de {nombre}: a la izquierda, lo que afirma la teoría; a la derecha, las capas medidas, a escala.',
    'ui.teorias.corte_teoria': 'Lo que afirma la teoría',
    'ui.teorias.corte_datos': 'Lo que miden los datos',
    'ui.completo.leer': 'Leer el texto completo',
    'ui.completo.etiqueta': 'Texto completo',
    'ui.completo.etiqueta_antigua': 'Traducción antigua',
    'ui.completo.leer_antigua': 'Leer la traducción antigua',
    'ui.completo.aviso_titulo': 'Traducción superada.',
    'ui.completo.versos': '{n} versos',
    'ui.completo.solo_es': 'El texto completo solo está disponible en castellano por ahora.',
    'ui.completo.presentacion': 'Sobre esta versión',
    'ui.completo.tablillas': 'Tablillas',
    'ui.completo.epilogo': 'Epílogo',
    'ui.completo.columna': 'Columna {n}',
    'ui.completo.laguna': 'Laguna',
    'ui.completo.hoy': 'Lo que se sabe hoy',
    'ui.completo.notas': 'Notas',
    'ui.completo.nota_n': 'Nota al verso {n}',
    'ui.completo.volver_texto': 'Pasajes comentados',
    'ui.completo.no_encontrado': 'No hay texto completo de «{id}».',
    'ui.pasaje.tipo_traduccion': 'Traducción (dominio público)',
    'ui.pasaje.tipo_cita': 'Cita breve',
    'ui.pasaje.tipo_parafrasis': 'Paráfrasis',
    'ui.actual.entradilla': 'Cómo se leen hoy los textos cuneiformes, qué se ha descubierto en las dos últimas décadas y cómo han llegado los mitos a la cultura popular.',
    'ui.actual.corrientes': 'Corrientes',
    'ui.actual.autores_clave': 'Autores clave',
    'ui.actual.entradas': 'Entradas',
    'ui.actual.hallazgos': 'Hallazgos recientes',
    'ui.actual.hallazgos_entradilla': 'Descubrimientos, publicaciones y sucesos que han cambiado el campo entre {inicio} y {fin}.',
    'ui.actual.regla': 'Línea de tiempo de {inicio} a {fin}; la lista sigue a continuación.',
    'ui.actual.recepcion': 'Recepción en la cultura popular',
    'ui.actual.recepcion_entradilla': 'Novelas, películas, series, juegos y música que reescriben los mitos. Se señalan las que beben de Sitchin.',
    'ui.actual.tipo': 'Tipo de obra',
    'ui.actual.todos': 'Todas',
    'ui.actual.sitchin': 'Influencia de Sitchin',
    'ui.actual.recepcion_vacio': 'Ninguna obra de este tipo.',
    'ui.actual.mas': 'Más información',
    'ui.actual.vacio': 'No hay lecturas actuales en los datos.',
    'ui.obra.literatura': 'Literatura',
    'ui.obra.cine': 'Cine',
    'ui.obra.serie': 'Serie',
    'ui.obra.comic': 'Cómic',
    'ui.obra.videojuego': 'Videojuego',
    'ui.obra.musica': 'Música',
    'ui.obra.otro': 'Otros',
    'ui.autores.grupos': 'Grupos de autores',
    'ui.autores.defensores': 'Defensores de los antiguos astronautas',
    'ui.asiriologos.entradilla': 'Quién descifró el cuneiforme y quién lo estudia hoy: dos siglos de investigación, agrupados por etapas.',
    'ui.asiriologos.hitos': 'La disciplina, de {inicio} a hoy',
    'ui.asiriologos.regla': 'Hitos de la asiriología entre {inicio} y {fin}; la lista sigue a continuación.',
    'ui.asiriologos.aportaciones': 'Aportaciones',
    'ui.asiriologos.obras': 'Obras',
    'ui.asiriologos.postura': 'Postura',
    'ui.asiriologos.entradas': 'Entradas relacionadas',
    'ui.asiriologos.enlace': 'Más información',
    'ui.asiriologos.vacio': 'No hay asiriólogos en los datos.',
    'ui.etapa.desciframiento': 'El desciframiento',
    'ui.etapa.clasica': 'Asiriología clásica',
    'ui.etapa.actual': 'Investigación actual',
    'ui.etapa.espana': 'Asiriología en España',
    'ui.etapa.critica': 'Crítica de los antiguos astronautas',
    'ui.etapa.otros': 'Otros'
  };

  var MARCADOR = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

  /** Marcadores {x} de una cadena, ordenados y sin repetir. */
  function marcadores(texto) {
    var res = [];
    str(texto).replace(MARCADOR, function (m) { if (res.indexOf(m) < 0) res.push(m); return m; });
    return res.sort();
  }

  /**
   * Texto de interfaz: busca la clave en el mapa de traducción y, si falta o está vacía, en el castellano.
   * Sustituye {x} por vars.x; los marcadores sin valor se dejan tal cual.
   */
  function texto(mapa, clave, vars) {
    var m = obj(mapa);
    var t = typeof m[clave] === 'string' && m[clave].trim() !== '' ? m[clave] : (Object.prototype.hasOwnProperty.call(TEXTOS, clave) ? TEXTOS[clave] : clave);
    var v = obj(vars);
    return t.replace(MARCADOR, function (todo, k) { return Object.prototype.hasOwnProperty.call(v, k) ? str(v[k]) : todo; });
  }

  /**
   * Recorre los textos traducibles de los datos en bruto ({cientifico, astronautas}) con claves estables.
   * visitar(clave, contenedor, campo) recibe solo cadenas no vacías. Ids repetidos o no válidos se saltan,
   * igual que en normalizarDatos.
   */
  function recorrerTextos(datos, visitar) {
    var r = obj(datos), c = obj(r.cientifico), a = obj(r.astronautas);
    function campo(pref, o, k) {
      if (o && typeof o === 'object' && typeof o[k] === 'string' && o[k].trim() !== '') visitar(pref + '.' + k, o, k);
    }
    function lista(pref, l) {
      if (!Array.isArray(l)) return;
      l.forEach(function (x, i) { if (typeof x === 'string' && x.trim() !== '') visitar(pref + '.' + i, l, i); });
    }
    function porIds(l, fn) {
      var vistos = Object.create(null);
      arr(l).forEach(function (x) {
        if (!x || typeof x !== 'object' || Array.isArray(x)) return;
        var id = slug(x.id);
        if (!id || vistos[id]) return;
        vistos[id] = true;
        fn(x, id);
      });
    }

    porIds(c.periodos, function (p, id) {
      ['nombre', 'descripcion'].forEach(function (k) { campo('c.periodos.' + id, p, k); });
    });
    porIds(c.entradas, function (e, id) {
      var pref = 'c.entradas.' + id;
      ['nombre', 'nombre_original', 'fecha_texto', 'resumen', 'interpretacion'].forEach(function (k) { campo(pref, e, k); });
      lista(pref + '.detalles', e.detalles);
      lista(pref + '.fuentes_primarias', e.fuentes_primarias);
      var destinos = Object.create(null);
      arr(e.relaciones).forEach(function (rel) {
        if (!rel || typeof rel !== 'object') return;
        var dest = slug(rel.id);
        if (!dest || destinos[dest]) return;
        destinos[dest] = true;
        campo(pref + '.relaciones.' + dest, rel, 'tipo');
      });
    });
    arr(c.glosario).forEach(function (g, i) {
      if (!g || typeof g !== 'object') return;
      campo('c.glosario.' + i, g, 'termino');
      campo('c.glosario.' + i, g, 'definicion');
    });
    porIds(a.autores, function (au, id) {
      // La vida solo se traduce si lleva texto además de años («1978– (serie: desde 2009)»).
      if (/[A-Za-zÀ-ÿ]/.test(str(au.vida))) campo('a.autores.' + id, au, 'vida');
      campo('a.autores.' + id, au, 'tesis');
      campo('a.autores.' + id, au, 'formacion');
    });
    porIds(a.entradas, function (e, id) {
      var pref = 'a.entradas.' + id;
      campo(pref, e, 'titulo_alternativo');
      campo(pref, e, 'interpretacion');
      arr(e.afirmaciones).forEach(function (x, i) {
        if (!x || typeof x !== 'object') return;
        ['afirmacion', 'replica', 'fuente_replica'].forEach(function (k) { campo(pref + '.afirmaciones.' + i, x, k); });
      });
      campo(pref, e, 'veredicto');
    });
    var porAnio = Object.create(null);
    arr(a.cronologia).forEach(function (hito) {
      if (!hito || typeof hito !== 'object' || num(hito.anio) === null) return;
      var anio = String(num(hito.anio));
      var n = porAnio[anio] = (porAnio[anio] || 0) + 1;
      campo('a.cronologia.' + anio + '-' + (n - 1), hito, 'evento');
    });
    var m = obj(a.metodo);
    lista('a.metodo.errores_frecuentes', m.errores_frecuentes);
    campo('a.metodo', m, 'por_que_atrae');

    // Clave estable para elementos sin id: un nombre (año, título) con contador si se repite.
    function contador() {
      var vistos = Object.create(null);
      return function (base) {
        var b = base || 'x';
        var n = vistos[b] = (vistos[b] === undefined ? 0 : vistos[b] + 1);
        return b + '-' + n;
      };
    }
    function hitos(pref, l) {
      var clave = contador();
      arr(l).forEach(function (hito) {
        if (!hito || typeof hito !== 'object' || num(hito.anio) === null) return;
        campo(pref + '.' + clave(String(num(hito.anio))), hito, 'evento');
      });
    }

    // Lecturas actuales (l.*). No se traducen los autores clave, las referencias ni los autores de las obras (nombres y títulos);
    // el título de una obra sí, porque a menudo lleva una aclaración («(película)», «(y saga)»).
    var l = obj(r.actual);
    porIds(l.corrientes, function (x, id) {
      campo('l.corrientes.' + id, x, 'nombre');
      campo('l.corrientes.' + id, x, 'descripcion');
    });
    porIds(l.entradas, function (x, id) {
      campo('l.entradas.' + id, x, 'titulo_actual');
      campo('l.entradas.' + id, x, 'lectura');
    });
    var claveHallazgo = contador();
    arr(l.hallazgos).forEach(function (x) {
      if (!x || typeof x !== 'object' || num(x.anio) === null) return;
      var pref = 'l.hallazgos.' + claveHallazgo(String(num(x.anio)));
      campo(pref, x, 'titulo');
      campo(pref, x, 'descripcion');
    });
    var claveObra = contador();
    arr(l.recepcion).forEach(function (x) {
      if (!x || typeof x !== 'object' || !str(x.obra).trim()) return;
      var pref = 'l.recepcion.' + claveObra(slug(x.obra));
      campo(pref, x, 'obra');
      campo(pref, x, 'descripcion');
    });

    // Asiriólogos (s.*). No se traducen nombres ni títulos de obras.
    var sa = obj(r.asiriologos);
    porIds(sa.autores, function (x, id) {
      var pref = 's.autores.' + id;
      if (/[A-Za-zÀ-ÿ]/.test(str(x.vida))) campo(pref, x, 'vida');
      ['pais', 'institucion', 'especialidad'].forEach(function (k) { campo(pref, x, k); });
      lista(pref + '.aportaciones', x.aportaciones);
      campo(pref, x, 'postura');
    });
    hitos('s.hitos', sa.hitos);

    // Textos (t.*). No se traducen títulos de ediciones ni nombres de autores.
    porIds(obj(r.textos).textos, function (x, id) {
      var pref = 't.textos.' + id;
      ['titulo', 'version', 'lengua'].forEach(function (k) { campo(pref, x, k); });
      arr(x.estructura).forEach(function (e, i) {
        if (!e || typeof e !== 'object') return;
        campo(pref + '.estructura.' + i, e, 'seccion');
        campo(pref + '.estructura.' + i, e, 'sinopsis');
      });
      // Los pasajes se identifican por su posición: las referencias («Tablilla I, 1–21…») son largas y se traducen.
      arr(x.pasajes).forEach(function (p, i) {
        if (!p || typeof p !== 'object') return;
        var pp = pref + '.pasajes.' + i;
        ['ref', 'texto', 'fuente', 'nota_academica'].forEach(function (k) { campo(pp, p, k); });
        var la = p.lectura_astronauta;
        if (la && typeof la === 'object') { campo(pp + '.lectura_astronauta', la, 'lectura'); campo(pp + '.lectura_astronauta', la, 'replica'); }
        var lc = p.lectura_actual;
        if (lc && typeof lc === 'object') ['enfoque', 'lectura', 'referencia'].forEach(function (k) { campo(pp + '.lectura_actual', lc, k); });
      });
    });
  }

  /** Mapa plano clave → texto con todos los textos traducibles de los datos en bruto. */
  function clavesDeDatos(datos) {
    var res = {};
    recorrerTextos(datos, function (clave, o, k) { res[clave] = o[k]; });
    return res;
  }

  /**
   * Copia de los datos en bruto con los textos del mapa aplicados por clave.
   * Las claves que faltan (o están vacías) conservan el castellano. No modifica `datos`.
   */
  function aplicarTraducciones(datos, mapa) {
    var copia = datos === undefined ? undefined : JSON.parse(JSON.stringify(datos));
    var m = obj(mapa);
    recorrerTextos(copia, function (clave, o, k) {
      if (Object.prototype.hasOwnProperty.call(m, clave) && typeof m[clave] === 'string' && m[clave].trim() !== '') o[k] = m[clave];
    });
    return copia;
  }

  /**
   * Primer idioma soportado de una lista de etiquetas BCP 47 (navigator.languages).
   * Compara la etiqueta completa y luego la subetiqueta principal: ca-ES-valencia → ca, pt-BR → pt.
   * Si ninguno coincide, devuelve 'es'.
   */
  function idiomaPreferido(lista, soportados) {
    var sop = arr(soportados).map(function (x) { return str(x).toLowerCase(); });
    var etiquetas = typeof lista === 'string' ? [lista] : arr(lista);
    for (var i = 0; i < etiquetas.length; i++) {
      var t = str(etiquetas[i]).trim().toLowerCase().replace(/_/g, '-');
      if (!t) continue;
      if (sop.indexOf(t) >= 0) return t;
      var principal = t.split('-')[0];
      if (sop.indexOf(principal) >= 0) return principal;
    }
    return IDIOMA_ORIGINAL;
  }

  /** Glosario ordenado según las reglas del idioma (copia). */
  function ordenarGlosario(glosario, idioma) {
    return arr(glosario).slice().sort(function (x, y) {
      return str(x && x.termino).localeCompare(str(y && y.termino), idioma || IDIOMA_ORIGINAL, { sensitivity: 'base' });
    });
  }

  /** Año legible: -3100 → «3100 a. C.», 1968 → «1968». aprox antepone «c.». mapa: traducción opcional. */
  function formatearAnio(anio, aprox, mapa) {
    var n = num(anio);
    if (n === null) return '';
    var t = n < 0 ? texto(mapa, 'ui.fecha.ac', { n: Math.abs(n) }) : (n < 1000 ? texto(mapa, 'ui.fecha.dc', { n: n }) : String(n));
    return aprox && n < 0 ? texto(mapa, 'ui.fecha.circa', { fecha: t }) : t;
  }

  /** Rango legible: (-5500, -4000) → «c. 5500–4000 a. C.». mapa: traducción opcional. */
  function formatearRango(inicio, fin, mapa) {
    var a = num(inicio), b = num(fin);
    if (a === null && b === null) return '';
    if (a === null || b === null) return formatearAnio(a === null ? b : a, true, mapa);
    if (a < 0 && b < 0) return texto(mapa, 'ui.fecha.rango_ac', { inicio: Math.abs(a), fin: Math.abs(b) });
    return formatearAnio(a, true, mapa) + ' – ' + formatearAnio(b, true, mapa);
  }

  /**
   * Interpreta el hash. Devuelve { vista, id? }: una de VISTAS, 'ficha' (#e-<id>), 'texto' (#t-<id>),
   * 'completo' (#c-<id>, texto completo) o 'asiriologos' con id (#as-<id>, abre la vista y señala a ese autor).
   */
  function parsearHash(hash) {
    var h = str(hash).replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* hash mal formado: se usa tal cual */ }
    var prefijos = [['e-', 'ficha'], ['t-', 'texto'], ['te-', 'teoria'], ['c-', 'completo'], ['as-', 'asiriologos']];
    for (var i = 0; i < prefijos.length; i++) {
      var p = prefijos[i][0];
      if (h.indexOf(p) === 0 && h.length > p.length) {
        var id = slug(h.slice(p.length));
        if (id) return { vista: prefijos[i][1], id: id };
      }
    }
    if (VISTAS.indexOf(h) >= 0) return { vista: h };
    return { vista: 'catalogo' };
  }

  /** Relaciones de una entrada que apuntan a entradas existentes (sin duplicados ni autorreferencias). */
  function relacionesValidas(entrada, porId) {
    var e = obj(entrada), mapa = obj(porId), vistos = Object.create(null);
    return arr(e.relaciones).filter(function (r) {
      var id = r && slug(r.id);
      if (!id || id === e.id || !mapa[id] || vistos[id]) return false;
      vistos[id] = true;
      return true;
    }).map(function (r) { return { id: slug(r.id), tipo: str(r.tipo) }; });
  }

  function enfoqueValido(x) { return ENFOQUES.indexOf(x) >= 0 ? x : 'cientifico'; }

  var MesoLogic = {
    CATEGORIAS: CATEGORIAS,
    CULTURAS: CULTURAS,
    VISTAS: VISTAS,
    ENFOQUES: ENFOQUES,
    LECTURAS: LECTURAS,
    ETAPAS: ETAPAS,
    TIPOS_PASAJE: TIPOS_PASAJE,
    TIPOS_OBRA: TIPOS_OBRA,
    columnasFicha: columnasFicha,
    lecturasDePasaje: lecturasDePasaje,
    pestanaInicial: pestanaInicial,
    lecturasVisibles: lecturasVisibles,
    especialistasDe: especialistasDe,
    agruparPorEtapa: agruparPorEtapa,
    filtrarRecepcion: filtrarRecepcion,
    textoDeEntrada: textoDeEntrada,
    posicionEnRango: posicionEnRango,
    reglaTemporal: reglaTemporal,
    esAtajoBuscar: esAtajoBuscar,
    usaEnfoque: usaEnfoque,
    normalizar: normalizar,
    slug: slug,
    escaparHTML: escaparHTML,
    urlSegura: urlSegura,
    normalizarDatos: normalizarDatos,
    indexarPorId: indexarPorId,
    textoBuscable: textoBuscable,
    coincideTexto: coincideTexto,
    filtrarEntradas: filtrarEntradas,
    contar: contar,
    construirGrafo: construirGrafo,
    vecinos: vecinos,
    aleatorio: aleatorio,
    disponerGrafo: disponerGrafo,
    escalaLineal: escalaLineal,
    marcasEje: marcasEje,
    disponerLinea: disponerLinea,
    formatearAnio: formatearAnio,
    formatearRango: formatearRango,
    parsearHash: parsearHash,
    normalizarCompletos: normalizarCompletos,
    normalizarTeorias: normalizarTeorias,
    posicionEscala: posicionEscala,
    pasoEscala: pasoEscala,
    contarVersos: contarVersos,
    relacionesValidas: relacionesValidas,
    enfoqueValido: enfoqueValido,
    IDIOMAS: IDIOMAS,
    IDIOMA_ORIGINAL: IDIOMA_ORIGINAL,
    TEXTOS: TEXTOS,
    marcadores: marcadores,
    texto: texto,
    clavesDeDatos: clavesDeDatos,
    aplicarTraducciones: aplicarTraducciones,
    idiomaPreferido: idiomaPreferido,
    ordenarGlosario: ordenarGlosario
  };

  global.MesoLogic = MesoLogic;
  if (typeof module !== 'undefined' && module.exports) module.exports = MesoLogic;

  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  /* ================================================================
     INTERFAZ
     ================================================================ */

  var SVGNS = 'http://www.w3.org/2000/svg';
  var CLAVE_ENFOQUE = 'meso.enfoque';
  var CLAVE_IDIOMA = 'meso.idioma';

  /* --- Traducción activa: mapa plano clave → texto ({} = castellano) --- */
  var traduccion = {};
  function t(clave, vars) { return texto(traduccion, clave, vars); }
  function etqCat(cat) { return CATEGORIAS.indexOf(cat) >= 0 ? t('ui.categoria.' + cat) : cat; }
  function etqCul(cul) { return CULTURAS.indexOf(cul) >= 0 ? t('ui.cultura.' + cul) : cul; }
  function etqEnfoque(e) { return t('ui.enfoque.' + e); }
  function etqEtapa(e) { return t('ui.etapa.' + (ETAPAS.indexOf(e) >= 0 ? e : 'otros')); }
  function etqObra(tipo) { return t('ui.obra.' + (TIPOS_OBRA.indexOf(tipo) >= 0 ? tipo : 'otro')); }
  var CLAVE_TIPO_PASAJE = { 'traduccion-dominio-publico': 'ui.pasaje.tipo_traduccion', 'cita-breve': 'ui.pasaje.tipo_cita', 'parafrasis': 'ui.pasaje.tipo_parafrasis' };
  var CLASE_LECTURA = { cientifico: 'academica', astronautas: 'astro', actual: 'actual' };
  function anio(v, aprox) { return formatearAnio(v, aprox, traduccion); }
  function rango(a, b) { return formatearRango(a, b, traduccion); }

  // Idiomas publicados junto a la página (los escribe build.mjs); sin la lista, se ofrecen todos.
  var codigos = IDIOMAS.map(function (x) { return x.codigo; });
  var DISPONIBLES = Array.isArray(global.__MESO_IDIOMAS__)
    ? codigos.filter(function (c) { return c === IDIOMA_ORIGINAL || global.__MESO_IDIOMAS__.indexOf(c) >= 0; })
    : codigos;

  var DATOS_ORIGINALES = global.__MESO_DATA__;
  var C, A, ACT, AS, TX, TE, porId, astroPorId, actualPorId, autorPorId, periodoPorId, textoPorId, corrientePorId, completoPorId, teoriaPorId;
  function prepararDatos(raw) {
    var D = normalizarDatos(raw);
    C = D.cientifico; A = D.astronautas; ACT = D.actual; AS = D.asiriologos; TX = D.textos;
    completoPorId = indexarPorId(D.completos);
    TE = D.teorias;
    teoriaPorId = indexarPorId(TE);
    porId = indexarPorId(C.entradas);
    astroPorId = indexarPorId(A.entradas.filter(function (e) { return porId[e.id]; }));
    actualPorId = indexarPorId(ACT.entradas.filter(function (e) { return porId[e.id]; }));
    autorPorId = indexarPorId(A.autores);
    periodoPorId = indexarPorId(C.periodos);
    textoPorId = indexarPorId(TX);
    corrientePorId = indexarPorId(ACT.corrientes);
  }
  prepararDatos(DATOS_ORIGINALES);

  var estado = {
    enfoque: 'cientifico',
    idioma: IDIOMA_ORIGINAL,
    filtros: { categoria: '', cultura: '', periodo: '', texto: '' },
    filtroGlosario: '',
    filtroRecepcion: '',
    vista: null
  };
  try { estado.enfoque = enfoqueValido(window.localStorage.getItem(CLAVE_ENFOQUE)); } catch (e) { /* sin almacenamiento */ }

  /* --- Construcción de nodos sin innerHTML --- */
  function anadir(el, hijos) {
    arr(hijos).forEach(function (h) {
      if (h === null || h === undefined || h === false || h === '') return;
      if (Array.isArray(h)) { anadir(el, h); return; }
      el.appendChild(typeof h === 'object' && h.nodeType ? h : document.createTextNode(str(h)));
    });
    return el;
  }
  function crear(ns, tag, props, hijos) {
    var el = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    Object.keys(obj(props)).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.setAttribute('class', v);
      else el.setAttribute(k, v === true ? '' : str(v));
    });
    return anadir(el, hijos === undefined ? [] : [hijos]);
  }
  function h(tag, props, hijos) { return crear(null, tag, props, hijos); }
  function s(tag, props, hijos) { return crear(SVGNS, tag, props, hijos); }
  function vaciar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* --- Iconos SVG en línea (trazo, sin relleno) --- */
  var ICONOS = {
    flecha: ['M5 12h14', 'M13 6l6 6-6 6'],
    externo: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
    aviso: ['M12 3.5 2.5 20h19L12 3.5z', 'M12 10v4.5', 'M12 17.2v.3'],
    libro: ['M3 5.5h5.5A3.5 3.5 0 0 1 12 9v10.5a2.5 2.5 0 0 0-2.5-2.5H3z', 'M21 5.5h-5.5A3.5 3.5 0 0 0 12 9v10.5a2.5 2.5 0 0 1 2.5-2.5H21z'],
    persona: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20.5c1.2-3.7 4.3-5.5 8-5.5s6.8 1.8 8 5.5'],
    estrella: ['M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z']
  };
  function icono(nombre, clase) {
    return s('svg', { class: 'icono' + (clase ? ' ' + clase : ''), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      arr(ICONOS[nombre]).map(function (d) { return s('path', { d: d }); }));
  }

  function etiquetaCat(cat) {
    return cat ? h('span', { class: 'cat cat-' + cat }, [h('span', { class: 'cat-marca', 'aria-hidden': 'true' }), etqCat(cat)]) : null;
  }
  function listaCulturas(culturas) {
    var l = arr(culturas);
    return l.length ? h('span', { class: 'culturas' }, l.map(etqCul).join(' · ')) : null;
  }
  function aviso(extra) {
    return h('p', { class: 'aviso', role: 'note' }, [icono('aviso', 'aviso-icono'), h('span', null, [h('strong', null, t('ui.aviso.marginal')), extra ? ' ' + extra : null])]);
  }
  /** Cadena traducida con marcadores que se sustituyen por nodos: «Según {autores}» → ['Según ', nodos]. */
  function plantillaNodos(clave, nodos) {
    var partes = [];
    var plantilla = t(clave);
    var ultimo = 0;
    plantilla.replace(MARCADOR, function (todo, k, pos) {
      partes.push(plantilla.slice(ultimo, pos));
      partes.push(Object.prototype.hasOwnProperty.call(nodos, k) ? nodos[k] : todo);
      ultimo = pos + todo.length;
      return todo;
    });
    partes.push(plantilla.slice(ultimo));
    return partes;
  }
  function bloque(titulo, contenido, clase) {
    var vacio = !contenido || (Array.isArray(contenido) && !contenido.length);
    if (vacio) return null;
    return h('section', { class: 'bloque ' + (clase || '') }, [h('h3', null, titulo), contenido]);
  }
  function listaTexto(items, ordenada) {
    var l = arr(items);
    return l.length ? h(ordenada ? 'ol' : 'ul', null, l.map(function (t) { return h('li', null, t); })) : null;
  }
  function parrafos(texto) {
    var t = str(texto).trim();
    if (!t) return null;
    return t.split(/\n{2,}/).map(function (p) { return h('p', null, p); });
  }
  /** Párrafos que conservan los saltos de línea (versos) como <br>. */
  function versos(texto) {
    var t = str(texto).trim();
    if (!t) return null;
    return t.split(/\n{2,}/).map(function (p) {
      var lineas = p.split('\n');
      var el = h('p');
      lineas.forEach(function (l, i) { if (i) el.appendChild(h('br')); el.appendChild(document.createTextNode(l)); });
      return el;
    });
  }
  /** Lista de enlaces a fichas (solo las que existen). */
  function enlacesEntradas(ids, clase) {
    var l = arr(ids).filter(function (id) { return porId[id]; });
    return l.length ? h('ul', { class: 'chips ' + (clase || '') }, l.map(function (id) {
      return h('li', null, h('a', { class: 'chip', href: '#e-' + id }, porId[id].nombre));
    })) : null;
  }
  function referencia(b) {
    var titulo = b.url ? h('a', { href: b.url, target: '_blank', rel: 'noopener noreferrer' }, b.titulo || b.url) : h('cite', null, b.titulo);
    return h('li', null, [b.autor ? b.autor + (b.anio !== null ? ' (' + b.anio + ')' : '') + '. ' : (b.anio !== null ? b.anio + '. ' : ''), titulo]);
  }
  function enlaceExterno(url, etiqueta) {
    return h('a', { class: 'externo', href: url, target: '_blank', rel: 'noopener noreferrer' }, [etiqueta, icono('externo')]);
  }
  function textoEntradas(n) { return n === 1 ? t('ui.catalogo.recuento_uno') : t('ui.catalogo.recuento_varios', { n: n }); }

  /* --- Elementos fijos de la plantilla --- */
  var raizApp = document.getElementById('app');
  var vista = document.getElementById('vista');
  var avisoGlobal = document.getElementById('aviso-global');
  var contexto = document.getElementById('contexto');
  var enfoqueDesc = document.getElementById('enfoque-desc');
  var buscador = document.getElementById('buscar');
  var menuBoton = document.getElementById('menu-boton');
  var barraPanel = document.getElementById('barra-panel');
  var botonBuscar = document.getElementById('boton-buscar');
  var pendienteBuscar = false;

  /** Muestra el selector de enfoque y el aviso global solo donde el enfoque importa. */
  function actualizarContexto() {
    var v = estado.vista ? estado.vista.vista : 'catalogo';
    var usa = usaEnfoque(v);
    if (contexto) contexto.hidden = !usa;
    avisoGlobal.hidden = !usa || estado.enfoque === 'cientifico' || estado.enfoque === 'actual';
    if (enfoqueDesc) enfoqueDesc.textContent = t('ui.enfoque.desc_' + estado.enfoque);
  }

  function marcarEnfoque() {
    document.documentElement.setAttribute('data-enfoque', estado.enfoque);
    ENFOQUES.forEach(function (e) {
      var r = document.getElementById('enfoque-' + e);
      if (r) r.checked = e === estado.enfoque;
    });
    actualizarContexto();
  }

  function cambiarEnfoque(e) {
    estado.enfoque = enfoqueValido(e);
    try { window.localStorage.setItem(CLAVE_ENFOQUE, estado.enfoque); } catch (err) { /* sin almacenamiento */ }
    marcarEnfoque();
    pintar(false);
  }

  ENFOQUES.forEach(function (e) {
    var r = document.getElementById('enfoque-' + e);
    if (r) r.addEventListener('change', function () { if (r.checked) cambiarEnfoque(e); });
  });

  /* --- Menú compacto (móvil) --- */
  function abrirMenu(abrir) {
    if (!menuBoton || !barraPanel) return;
    barraPanel.classList.toggle('abierto', abrir);
    menuBoton.setAttribute('aria-expanded', String(abrir));
  }
  if (menuBoton) menuBoton.addEventListener('click', function () { abrirMenu(menuBoton.getAttribute('aria-expanded') !== 'true'); });
  document.addEventListener('click', function (ev) {
    if (!barraPanel || !barraPanel.classList.contains('abierto')) return;
    if (!barraPanel.contains(ev.target) && !menuBoton.contains(ev.target)) abrirMenu(false);
  });

  /* --- Buscador y atajo «/» --- */
  function enfocarBuscador() {
    if (parsearHash(location.hash).vista !== 'catalogo') {
      pendienteBuscar = true;
      location.hash = '#catalogo';
      return;
    }
    if (buscador) { buscador.focus(); buscador.select(); }
  }
  if (buscador) {
    buscador.value = estado.filtros.texto;
    buscador.addEventListener('input', function () {
      estado.filtros.texto = buscador.value;
      var res = document.getElementById('resultados'), rec = document.getElementById('recuento');
      if (res && rec) pintarResultados(res, rec);
    });
  }
  if (botonBuscar) botonBuscar.addEventListener('click', function () { abrirMenu(false); enfocarBuscador(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && barraPanel && barraPanel.classList.contains('abierto')) { abrirMenu(false); menuBoton.focus(); return; }
    var a = document.activeElement;
    if (!esAtajoBuscar(ev.key, { ctrl: ev.ctrlKey, meta: ev.metaKey, alt: ev.altKey, etiqueta: a && a.tagName, editable: !!(a && a.isContentEditable) })) return;
    ev.preventDefault();
    enfocarBuscador();
  });

  /* --- Idioma --- */
  var selectorIdioma = document.getElementById('selector-idioma');
  var avisoIdioma = document.getElementById('aviso-idioma');
  var avisoTraduccion = document.getElementById('aviso-traduccion');
  var avisoIdiomaError = document.getElementById('aviso-idioma-error');
  var cacheTraducciones = {};
  var peticionIdioma = 0;

  /** Textos fijos de la plantilla: data-i18n (contenido), data-i18n-aria-label, -placeholder y -title. */
  function traducirPlantilla() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    ['aria-label', 'placeholder', 'title'].forEach(function (atr) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-' + atr + ']'), function (el) {
        el.setAttribute(atr, t(el.getAttribute('data-i18n-' + atr)));
      });
    });
  }

  function marcarAvisosIdioma(error) {
    if (!avisoIdioma) return;
    avisoTraduccion.hidden = traduccion['meta.revision'] !== 'automatica';
    avisoIdiomaError.hidden = !error;
    avisoIdioma.hidden = avisoTraduccion.hidden && avisoIdiomaError.hidden;
  }

  function aplicarIdioma(idioma, mapa) {
    estado.idioma = idioma;
    traduccion = idioma === IDIOMA_ORIGINAL ? {} : obj(mapa);
    prepararDatos(idioma === IDIOMA_ORIGINAL ? DATOS_ORIGINALES : aplicarTraducciones(DATOS_ORIGINALES, traduccion));
    document.documentElement.setAttribute('lang', idioma);
    if (selectorIdioma) selectorIdioma.value = idioma;
    traducirPlantilla();
    marcarAvisosIdioma(false);
  }

  /** Carga i18n/<idioma>.json (ruta relativa) y vuelve a pintar la vista actual. */
  function cambiarIdioma(idioma, guardar) {
    var id = ++peticionIdioma;
    var carga;
    if (idioma === IDIOMA_ORIGINAL) carga = Promise.resolve({});
    else if (cacheTraducciones[idioma]) carga = Promise.resolve(cacheTraducciones[idioma]);
    else {
      carga = fetch('i18n/' + encodeURIComponent(idioma) + '.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (mapa) {
        if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) throw new Error('traducción no válida');
        cacheTraducciones[idioma] = mapa;
        return mapa;
      });
    }
    return carga.then(function (mapa) {
      if (id !== peticionIdioma) return;
      aplicarIdioma(idioma, mapa);
      if (guardar) { try { window.localStorage.setItem(CLAVE_IDIOMA, idioma); } catch (e) { /* sin almacenamiento */ } }
      pintar(false);
    }, function () {
      if (id !== peticionIdioma) return;
      if (selectorIdioma) selectorIdioma.value = estado.idioma;
      marcarAvisosIdioma(true);
    });
  }

  if (selectorIdioma) {
    vaciar(selectorIdioma);
    IDIOMAS.forEach(function (x) {
      if (DISPONIBLES.indexOf(x.codigo) >= 0) selectorIdioma.appendChild(h('option', { value: x.codigo, lang: x.codigo }, x.nombre));
    });
    selectorIdioma.value = IDIOMA_ORIGINAL;
    selectorIdioma.addEventListener('change', function () { cambiarIdioma(selectorIdioma.value, true); });
  }

  function idiomaInicial() {
    var guardado = null;
    try { guardado = window.localStorage.getItem(CLAVE_IDIOMA); } catch (e) { /* sin almacenamiento */ }
    if (guardado && DISPONIBLES.indexOf(guardado) >= 0) return guardado;
    var nav = window.navigator || {};
    return idiomaPreferido(nav.languages && nav.languages.length ? nav.languages : [nav.language], DISPONIBLES);
  }

  var SECCION_DE = { ficha: 'catalogo', texto: 'textos', completo: 'textos', teoria: 'teorias', asiriologos: 'autores' };
  function marcarNav(v) {
    var actual = SECCION_DE[v] || v;
    Array.prototype.forEach.call(document.querySelectorAll('.nav a[data-vista]'), function (a) {
      if (a.getAttribute('data-vista') === actual) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* --- Catálogo --- */
  function opcionesSelect(id, etiqueta, valores, etiquetas, actual, conteo) {
    return h('div', { class: 'campo' }, [
      h('label', { for: id }, etiqueta),
      h('select', { id: id, name: id }, [h('option', { value: '' }, t('ui.catalogo.todas_culturas'))].concat(valores.map(function (v) {
        var n = conteo[v] || 0;
        return h('option', { value: v, selected: v === actual }, etiquetas(v) + ' (' + n + ')');
      })))
    ]);
  }

  var ENTRADILLA_CATALOGO = {
    cientifico: 'ui.catalogo.entradilla_cientifico', astronautas: 'ui.catalogo.entradilla_astronautas',
    actual: 'ui.catalogo.entradilla_actual', comparar: 'ui.catalogo.entradilla_comparar_lecturas'
  };

  function vistaCatalogo() {
    var f = estado.filtros;
    var conteoCat = contar(C.entradas, 'categoria');
    var conteoCul = contar(C.entradas, 'culturas');

    var catBotones = h('div', { class: 'segmentos', role: 'group', 'aria-labelledby': 'etq-cat' },
      [''].concat(CATEGORIAS).map(function (c) {
        return h('button', {
          type: 'button', id: 'cat-' + (c || 'todas'), class: 'seg', 'aria-pressed': String(f.categoria === c),
          onclick: function () { f.categoria = c; pintar(false); }
        }, [c ? etiquetaCat(c) : t('ui.catalogo.todas_categorias'), h('span', { class: 'num' }, String(c ? conteoCat[c] || 0 : C.entradas.length))]);
      }));

    var resultados = h('div', { class: 'tarjetas', id: 'resultados', 'aria-live': 'polite' });
    var recuento = h('p', { class: 'recuento', id: 'recuento' });
    var selCultura = opcionesSelect('filtro-cultura', t('ui.catalogo.cultura'), CULTURAS, etqCul, f.cultura, conteoCul);
    selCultura.querySelector('select').addEventListener('change', function (ev) { f.cultura = ev.target.value; pintarResultados(resultados, recuento); });

    var chipPeriodo = null;
    if (f.periodo) {
      var p = periodoPorId[f.periodo];
      chipPeriodo = h('p', { class: 'chip-periodo' }, [
        t('ui.catalogo.periodo') + ' ', h('strong', null, p ? p.nombre : f.periodo), p ? ' (' + rango(p.inicio, p.fin) + ')' : '',
        h('button', { type: 'button', id: 'quitar-periodo', class: 'boton-texto', onclick: function () { f.periodo = ''; pintar(false); } }, t('ui.catalogo.quitar_filtro'))
      ]);
    }

    var cont = h('div', { class: 'catalogo' }, [
      h('header', { class: 'cab-vista cab-fila' }, [
        h('div', null, [h('h2', null, t('ui.nav.catalogo')), h('p', { class: 'entradilla' }, t(ENTRADILLA_CATALOGO[estado.enfoque]))]),
        recuento
      ]),
      h('div', { class: 'filtros' }, [
        h('div', { class: 'campo campo-cat' }, [h('span', { class: 'etq', id: 'etq-cat' }, t('ui.catalogo.categoria')), catBotones]),
        selCultura
      ]),
      chipPeriodo,
      resultados
    ]);
    pintarResultados(resultados, recuento);
    return cont;
  }

  function pintarResultados(cont, recuento) {
    var f = estado.filtros;
    var lista = filtrarEntradas(C.entradas, {
      categoria: f.categoria, cultura: f.cultura, periodo: f.periodo, texto: f.texto, enfoque: estado.enfoque
    }, astroPorId, actualPorId);
    vaciar(cont);
    recuento.textContent = textoEntradas(lista.length);
    if (!lista.length) {
      anadir(cont, h('p', { class: 'vacio' }, t('ui.catalogo.vacio')));
      return;
    }
    lista.forEach(function (e) { cont.appendChild(tarjeta(e)); });
  }

  function extractoAstro(alt) {
    return h('span', { class: 't-alt' }, [h('span', { class: 'sello' }, t('ui.tarjeta.sello')), ' ', alt.titulo_alternativo || alt.interpretacion]);
  }
  function extractoActual(act) {
    return h('span', { class: 't-act' }, [h('span', { class: 'sello sello-actual' }, t('ui.tarjeta.sello_actual')), ' ', act.titulo_actual || act.lectura]);
  }

  function tarjeta(e) {
    var alt = astroPorId[e.id], act = actualPorId[e.id], tx = textoPorId[e.id];
    var enf = estado.enfoque;
    var cuerpo;
    if (enf === 'astronautas') cuerpo = [alt ? extractoAstro(alt) : h('span', { class: 't-sin' }, t('ui.tarjeta.sin_alt'))];
    else if (enf === 'actual') cuerpo = [act ? extractoActual(act) : h('span', { class: 't-sin' }, t('ui.tarjeta.sin_actual'))];
    else if (enf === 'comparar') cuerpo = [h('span', { class: 't-resumen' }, e.resumen), act ? extractoActual(act) : null, alt ? extractoAstro(alt) : null];
    else cuerpo = [h('span', { class: 't-resumen' }, e.resumen)];
    return h('a', { class: 'tarjeta' + (alt ? ' con-alt' : '') + (act ? ' con-actual' : ''), href: '#e-' + e.id }, [
      h('span', { class: 't-meta' }, [etiquetaCat(e.categoria), listaCulturas(e.culturas)]),
      h('span', { class: 't-nombre' }, e.nombre),
      e.nombre_original ? h('span', { class: 't-original' }, e.nombre_original) : null,
      h('span', { class: 't-cuerpo' }, cuerpo),
      h('span', { class: 't-pie' }, [
        tx ? h('span', { class: 't-insignia' }, [icono('libro'), t('ui.nav.textos')]) : h('span'),
        icono('flecha', 't-flecha')
      ])
    ]);
  }

  /* --- Ficha --- */
  function columnaAcademica(e) {
    return h('div', { class: 'columna academica' }, [
      h('p', { class: 'col-etq' }, t('ui.ficha.col_academica')),
      bloque(t('ui.ficha.resumen'), parrafos(e.resumen)),
      bloque(t('ui.ficha.interpretacion'), parrafos(e.interpretacion)),
      bloque(t('ui.ficha.detalles'), listaTexto(e.detalles)),
      bloque(t('ui.ficha.fuentes'), listaTexto(e.fuentes_primarias)),
      bloque(t('ui.ficha.bibliografia'), e.bibliografia.length ? h('ul', { class: 'biblio' }, e.bibliografia.map(referencia)) : null)
    ]);
  }

  function afirmacionYReplica(afirmacion, replica, fuente) {
    return [
      afirmacion ? h('p', { class: 'afirmacion' }, [h('span', { class: 'rot' }, t('ui.ficha.afirmacion')), afirmacion]) : null,
      h('div', { class: 'replica' }, [
        h('span', { class: 'rot' }, t('ui.ficha.replica')),
        h('p', null, replica || t('ui.ficha.sin_replica')),
        fuente ? h('p', { class: 'fuente' }, fuente) : null
      ])
    ];
  }

  function columnaAstro(e) {
    var alt = astroPorId[e.id];
    if (!alt) {
      return h('div', { class: 'columna astro' }, [
        h('p', { class: 'col-etq' }, t('ui.ficha.col_astro')),
        h('p', { class: 't-sin' }, t('ui.ficha.sin_alt'))
      ]);
    }
    var autores = alt.autores.map(function (id) { return autorPorId[id]; }).filter(Boolean);
    return h('div', { class: 'columna astro' }, [
      h('p', { class: 'col-etq' }, t('ui.ficha.col_astro')),
      aviso(t('ui.ficha.aviso_alt')),
      alt.titulo_alternativo ? h('p', { class: 'alt-titulo' }, alt.titulo_alternativo) : null,
      autores.length ? h('p', { class: 'alt-autores' }, plantillaNodos('ui.ficha.segun', { autores: autores.map(function (a, i) {
        return [i ? (i === autores.length - 1 ? ' ' + t('ui.lista.y') + ' ' : ', ') : '', h('a', { href: '#autores' }, a.nombre)];
      }) })) : null,
      bloque(t('ui.ficha.interpretacion_propuesta'), parrafos(alt.interpretacion)),
      alt.afirmaciones.length ? h('section', { class: 'bloque' }, [
        h('h3', null, t('ui.ficha.afirmaciones')),
        h('ol', { class: 'afirmaciones' }, alt.afirmaciones.map(function (a) {
          return h('li', null, afirmacionYReplica(a.afirmacion, a.replica, a.fuente_replica));
        }))
      ]) : null,
      alt.veredicto ? h('p', { class: 'veredicto' }, [h('span', { class: 'rot' }, t('ui.ficha.veredicto')), alt.veredicto]) : null
    ]);
  }

  function chipsCorrientes(ids) {
    var l = arr(ids).map(function (id) { return corrientePorId[id]; }).filter(Boolean);
    return l.length ? h('ul', { class: 'chips chips-actual', 'aria-label': t('ui.ficha.corrientes') }, l.map(function (c) {
      return h('li', null, h('a', { class: 'chip', href: '#actual' }, c.nombre));
    })) : null;
  }

  function columnaActual(e) {
    var act = actualPorId[e.id];
    if (!act) {
      return h('div', { class: 'columna actual' }, [
        h('p', { class: 'col-etq' }, t('ui.ficha.col_actual')),
        h('p', { class: 't-sin' }, t('ui.ficha.sin_actual'))
      ]);
    }
    return h('div', { class: 'columna actual' }, [
      h('p', { class: 'col-etq' }, t('ui.ficha.col_actual')),
      act.titulo_actual ? h('p', { class: 'act-titulo' }, act.titulo_actual) : null,
      chipsCorrientes(act.corrientes),
      bloque(t('ui.ficha.lectura'), parrafos(act.lectura)),
      bloque(t('ui.ficha.referencias'), act.referencias.length ? h('ul', { class: 'biblio' }, act.referencias.map(referencia)) : null)
    ]);
  }

  var COLUMNA = { cientifico: columnaAcademica, astronautas: columnaAstro, actual: columnaActual };

  function notaCruce(textoNota, id, etiqueta, enfoque) {
    return h('p', { class: 'nota-cruce' }, [textoNota + ' ',
      h('button', { type: 'button', id: id, class: 'boton-texto', onclick: function () { cambiarEnfoque(enfoque); } }, etiqueta)]);
  }

  function vistaFicha(id) {
    var e = porId[id];
    if (!e) {
      return h('div', { class: 'ficha' }, [
        h('h2', { tabindex: '-1', class: 'foco-inicial' }, t('ui.ficha.no_encontrada')),
        h('p', null, [t('ui.ficha.no_encontrada_texto', { id: id }), ' ', h('a', { href: '#catalogo' }, t('ui.ficha.volver'))])
      ]);
    }
    var p = periodoPorId[e.periodo];
    var alt = astroPorId[e.id], act = actualPorId[e.id], tx = textoPorId[e.id];
    var cols = columnasFicha(estado.enfoque, { astronautas: !!alt, actual: !!act });
    var cuerpo;
    if (estado.enfoque === 'comparar') {
      cuerpo = h('div', { class: 'comparar n-' + cols.length }, cols.map(function (c) { return COLUMNA[c](e); }));
    } else {
      var notas = [];
      if (estado.enfoque === 'cientifico') {
        if (act) notas.push(notaCruce(t('ui.ficha.existe_actual'), 'ver-actual', t('ui.ficha.ver_actual'), 'actual'));
        if (alt) notas.push(notaCruce(t('ui.ficha.existe_alt'), 'ver-alternativa', t('ui.ficha.comparar'), 'comparar'));
      } else {
        notas.push(notaCruce(t('ui.ficha.lectura_academica'), 'ver-academica', t('ui.ficha.ver_comparadas'), 'comparar'));
      }
      cuerpo = h('div', { class: 'una' }, [COLUMNA[cols[0]](e), notas]);
    }

    var grafo = construirGrafo(C.entradas);
    var rels = relacionesValidas(e, porId);
    var tipos = Object.create(null);
    rels.forEach(function (r) { tipos[r.id] = r.tipo; });
    vecinos(grafo, e.id).forEach(function (v) { if (!(v.id in tipos)) tipos[v.id] = v.tipos[0] || ''; });
    var idsRel = Object.keys(tipos);
    var especialistas = especialistasDe(AS.autores, e.id);

    return h('article', { class: 'ficha' }, [
      h('p', { class: 'migas' }, [h('a', { href: '#catalogo' }, t('ui.nav.catalogo')), h('span', { 'aria-hidden': 'true' }, ' / '), e.categoria ? etqCat(e.categoria) : t('ui.ficha.entrada')]),
      h('header', { class: 'ficha-cab' }, [
        h('div', { class: 'ficha-cab-txt' }, [
          h('span', { class: 't-meta' }, [etiquetaCat(e.categoria), listaCulturas(e.culturas)]),
          h('h2', { tabindex: '-1', class: 'foco-inicial' }, e.nombre),
          e.nombre_original ? h('p', { class: 'original' }, e.nombre_original) : null
        ]),
        h('div', { class: 'ficha-cab-datos' }, [
          h('dl', { class: 'datos' }, [
            p ? [h('dt', null, t('ui.ficha.periodo')), h('dd', null, h('button', {
              type: 'button', id: 'ficha-periodo', class: 'boton-texto',
              onclick: function () { estado.filtros.periodo = p.id; location.hash = '#catalogo'; }
            }, p.nombre + ' (' + rango(p.inicio, p.fin) + ')'))] : null,
            e.fecha_texto ? [h('dt', null, t('ui.ficha.datacion')), h('dd', null, e.fecha_texto)] : null
          ]),
          tx ? h('a', { class: 'boton boton-primario', id: 'leer-texto', href: '#t-' + tx.id }, [icono('libro'), t('ui.ficha.leer_texto')]) : null
        ])
      ]),
      cuerpo,
      (idsRel.length || especialistas.length) ? h('div', { class: 'ficha-anexos' }, [
        especialistas.length ? h('section', { class: 'bloque especialistas' }, [
          h('h3', null, t('ui.ficha.especialistas')),
          h('ul', null, especialistas.map(function (a) {
            return h('li', null, [icono('persona'), h('span', null, [
              h('a', { href: '#as-' + a.id }, a.nombre),
              h('span', { class: 'tipo' }, [etqEtapa(a.etapa), a.institucion || a.pais].filter(Boolean).join(' · '))
            ])]);
          }))
        ]) : null,
        idsRel.length ? h('section', { class: 'bloque relaciones' }, [
          h('h3', null, t('ui.ficha.relaciones')),
          h('ul', null, idsRel.map(function (rid) {
            var r = porId[rid];
            return h('li', null, [h('a', { href: '#e-' + rid }, r.nombre), tipos[rid] ? h('span', { class: 'tipo' }, tipos[rid]) : null]);
          }))
        ]) : null
      ]) : null
    ]);
  }

  /* --- Textos --- */
  function textoPasajes(n) { return n === 1 ? t('ui.textos.pasajes_uno') : t('ui.textos.pasajes_varios', { n: n }); }

  function vistaTextos() {
    return h('div', { class: 'textos' }, [
      h('header', { class: 'cab-vista' }, [h('h2', null, t('ui.nav.textos')), h('p', { class: 'entradilla' }, t('ui.textos.entradilla'))]),
      TX.length ? h('ul', { class: 'lista-textos' }, TX.map(function (x) {
        var e = porId[x.id];
        var tipos = TIPOS_PASAJE.filter(function (tp) { return x.pasajes.some(function (p) { return p.tipo === tp; }); });
        return h('li', null, h('a', { class: 'texto-tarjeta', href: '#t-' + x.id }, [
          h('span', { class: 'tt-lengua' }, x.lengua),
          h('span', { class: 'tt-titulo' }, x.titulo),
          x.version ? h('span', { class: 'tt-version' }, x.version) : null,
          h('span', { class: 'tt-pie' }, [
            h('span', { class: 'tt-num' }, textoPasajes(x.pasajes.length)),
            completoPorId[x.id] ? h('span', { class: 'tt-completo' + (completoPorId[x.id].antigua ? ' tt-antigua' : '') }, etqCompleto(completoPorId[x.id])) : null,
            tipos.map(function (tp) { return h('span', { class: 'tipo-pasaje tp-' + tp }, t(CLAVE_TIPO_PASAJE[tp])); }),
            e ? h('span', { class: 'tt-entrada' }, e.nombre) : null
          ])
        ]));
      })) : h('p', { class: 'vacio aviso-vacio', id: 'textos-vacio' }, t('ui.textos.vacio'))
    ]);
  }

  function panelAcademico(p) { return parrafos(p.nota_academica); }
  function panelAstro(p) {
    var la = p.lectura_astronauta;
    return [
      aviso(),
      la.autor ? h('p', { class: 'alt-autores' }, t('ui.ficha.segun', { autores: la.autor })) : null,
      h('div', { class: 'afirmaciones-pasaje' }, afirmacionYReplica(la.lectura, la.replica, ''))
    ];
  }
  function panelActual(p) {
    var lc = p.lectura_actual;
    return [
      lc.enfoque ? h('p', { class: 'chips chips-actual' }, h('span', { class: 'chip' }, lc.enfoque)) : null,
      parrafos(lc.lectura),
      lc.referencia ? h('p', { class: 'fuente' }, [h('span', { class: 'rot' }, t('ui.ficha.referencias')), lc.referencia]) : null
    ];
  }
  var PANEL = { cientifico: panelAcademico, astronautas: panelAstro, actual: panelActual };
  function etqLectura(l) { return l === 'cientifico' ? t('ui.textos.nota_academica') : etqEnfoque(l); }

  function lecturasPasaje(p, i) {
    var disp = lecturasDePasaje(p);
    if (!disp.length) return h('p', { class: 't-sin' }, t('ui.textos.sin_lecturas'));
    if (estado.enfoque === 'comparar') {
      return h('div', { class: 'lecturas lecturas-comparar n-' + disp.length, role: 'group', 'aria-label': t('ui.textos.lecturas') }, disp.map(function (l) {
        return h('div', { class: 'lectura columna ' + CLASE_LECTURA[l] }, [h('p', { class: 'col-etq' }, etqLectura(l)), PANEL[l](p)]);
      }));
    }
    var sel = pestanaInicial(disp, estado.enfoque);
    var base = 'p' + i;
    var pestanas = {}, paneles = {};
    function seleccionar(l, enfocar) {
      disp.forEach(function (x) {
        var activa = x === l;
        pestanas[x].setAttribute('aria-selected', String(activa));
        pestanas[x].setAttribute('tabindex', activa ? '0' : '-1');
        paneles[x].hidden = !activa;
      });
      if (enfocar) pestanas[l].focus();
    }
    disp.forEach(function (l) {
      pestanas[l] = h('button', {
        type: 'button', role: 'tab', id: base + '-tab-' + l, class: 'pestana pestana-' + l,
        'aria-selected': String(l === sel), 'aria-controls': base + '-panel-' + l, tabindex: l === sel ? '0' : '-1',
        onclick: function () { seleccionar(l, false); },
        onkeydown: function (ev) {
          var k = disp.indexOf(l), n = disp.length, d = null;
          if (ev.key === 'ArrowRight') d = disp[(k + 1) % n];
          else if (ev.key === 'ArrowLeft') d = disp[(k - 1 + n) % n];
          else if (ev.key === 'Home') d = disp[0];
          else if (ev.key === 'End') d = disp[n - 1];
          if (d) { ev.preventDefault(); seleccionar(d, true); }
        }
      }, etqLectura(l));
      paneles[l] = h('div', {
        role: 'tabpanel', id: base + '-panel-' + l, class: 'lectura ' + CLASE_LECTURA[l],
        'aria-labelledby': base + '-tab-' + l, tabindex: '0', hidden: l !== sel
      }, PANEL[l](p));
    });
    return h('div', { class: 'lecturas' }, [
      h('div', { class: 'pestanas', role: 'tablist', 'aria-label': t('ui.textos.lecturas') }, disp.map(function (l) { return pestanas[l]; })),
      disp.map(function (l) { return paneles[l]; })
    ]);
  }

  function pasaje(p, i) {
    return h('section', { class: 'pasaje tipo-' + (p.tipo || 'otro'), id: 'pasaje-' + i, 'aria-labelledby': 'pasaje-' + i + '-ref' }, [
      h('header', { class: 'pasaje-cab' }, [
        h('h3', { id: 'pasaje-' + i + '-ref', class: 'pasaje-ref', tabindex: '-1' }, p.ref || '§ ' + (i + 1)),
        p.tipo ? h('span', { class: 'tipo-pasaje tp-' + p.tipo }, t(CLAVE_TIPO_PASAJE[p.tipo])) : null
      ]),
      h(p.tipo === 'parafrasis' ? 'div' : 'blockquote', { class: 'pasaje-texto' }, versos(p.texto)),
      p.fuente ? h('p', { class: 'pasaje-fuente' }, [h('span', { class: 'rot' }, t('ui.textos.fuente')), p.fuente]) : null,
      lecturasPasaje(p, i)
    ]);
  }

  function irAPasaje(i) {
    var el = document.getElementById('pasaje-' + i + '-ref');
    if (!el) return;
    var indice = document.getElementById('indice');
    if (indice && window.matchMedia && !window.matchMedia('(min-width: 961px)').matches) indice.open = false;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  }

  function vistaTexto(id) {
    var x = textoPorId[id];
    if (!x) {
      return h('div', { class: 'texto-lector' }, [
        h('h2', { tabindex: '-1', class: 'foco-inicial' }, t('ui.textos.no_encontrado')),
        h('p', null, [t('ui.textos.no_encontrado_texto', { id: id }), ' ', h('a', { href: '#textos' }, t('ui.textos.volver'))])
      ]);
    }
    var e = porId[x.id];
    var abierto = !window.matchMedia || window.matchMedia('(min-width: 961px)').matches;
    var indice = h('details', { class: 'indice', id: 'indice', open: abierto }, [
      h('summary', null, t('ui.textos.indice')),
      x.estructura.length ? h('section', { class: 'indice-bloque' }, [
        h('h3', null, t('ui.textos.estructura')),
        h('ol', { class: 'estructura' }, x.estructura.map(function (sec) {
          return h('li', null, [h('strong', null, sec.seccion), sec.sinopsis ? h('span', null, sec.sinopsis) : null]);
        }))
      ]) : null,
      h('section', { class: 'indice-bloque' }, [
        h('h3', null, t('ui.textos.pasajes')),
        h('ol', { class: 'indice-pasajes' }, x.pasajes.map(function (p, i) {
          return h('li', null, h('button', { type: 'button', class: 'boton-indice', id: 'ir-pasaje-' + i, onclick: function () { irAPasaje(i); } }, p.ref || '§ ' + (i + 1)));
        }))
      ])
    ]);
    return h('article', { class: 'texto-lector' }, [
      h('p', { class: 'migas' }, [h('a', { href: '#textos' }, t('ui.nav.textos')), h('span', { 'aria-hidden': 'true' }, ' / '), x.titulo]),
      h('header', { class: 'texto-cab' }, [
        x.lengua ? h('p', { class: 'tt-lengua' }, x.lengua) : null,
        h('h2', { tabindex: '-1', class: 'foco-inicial' }, x.titulo),
        x.version ? h('p', { class: 'texto-version' }, x.version) : null,
        h('div', { class: 'texto-meta' }, [
          x.ediciones.length ? h('div', { class: 'ediciones' }, [
            h('h3', null, t('ui.textos.ediciones')),
            h('ul', { class: 'biblio' }, x.ediciones.map(function (ed) { return referencia({ titulo: ed.titulo, autor: ed.autor, anio: ed.anio, url: '' }); }))
          ]) : null,
          h('div', { class: 'texto-acciones' }, [
            completoPorId[x.id] ? h('a', { class: 'boton boton-primario', href: '#c-' + x.id, id: 'leer-completo' }, [icono('libro'), t(completoPorId[x.id].antigua ? 'ui.completo.leer_antigua' : 'ui.completo.leer')]) : null,
            e ? h('a', { class: 'boton', href: '#e-' + e.id, id: 'ver-ficha' }, [t('ui.textos.ficha'), ': ', e.nombre, icono('flecha')]) : null
          ])
        ])
      ]),
      h('div', { class: 'lector' }, [
        h('aside', { class: 'lector-indice' }, indice),
        h('div', { class: 'lector-cuerpo' }, x.pasajes.map(pasaje))
      ])
    ]);
  }

  /* --- Texto completo (solo castellano) --- */
  function etqCompleto(x) { return t(x.antigua ? 'ui.completo.etiqueta_antigua' : 'ui.completo.etiqueta'); }

  function romano(n) {
    var r = '', v = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    v.forEach(function (p) { while (n >= p[0]) { r += p[1]; n -= p[0]; } });
    return r;
  }

  function irA(idElemento) {
    var el = document.getElementById(idElemento);
    if (!el) return;
    var indice = document.getElementById('indice');
    if (indice && window.matchMedia && !window.matchMedia('(min-width: 961px)').matches) indice.open = false;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  }

  function tablillaCompleta(tb) {
    var base = 'tablilla-' + tb.n;
    var notas = [];
    var cuerpo = [];
    var col = '';
    tb.items.forEach(function (it, k) {
      if (it.tipo === 'verso') {
        // Referencia del verso: «12», o «II 12» si la tablilla está dividida en columnas; sin número, la del anterior.
        var ref = it.n === null ? '' : (col ? col + ' ' : '') + it.n;
        var nota = null;
        if (it.nota) {
          var idNota = base + '-nota-' + k;
          notas.push({ id: idNota, ref: ref, nota: it.nota });
          nota = h('a', { class: 'llamada', href: '#' + idNota, id: idNota + '-ref', 'aria-label': ref ? t('ui.completo.nota_n', { n: ref }) : t('ui.completo.notas'),
            onclick: function (ev) { ev.preventDefault(); irA(idNota); } }, '*');
        }
        var marca = it.n !== null && it.n % 5 === 0;
        cuerpo.push(h('p', { class: 'verso' + (marca ? ' verso-numerado' : ''), id: base + '-i' + k }, [
          h('span', { class: 'verso-n', 'aria-hidden': 'true' }, it.n === null ? '' : String(it.n)),
          h('span', { class: 'verso-t' }, [it.v, nota])
        ]));
      } else if (it.tipo === 'col') {
        col = it.texto;
        cuerpo.push(h('h4', { class: 'columna-tablilla' }, t('ui.completo.columna', { n: it.texto })));
      } else if (it.tipo === 'sub') {
        cuerpo.push(h('p', { class: 'subtitulo-escena' }, it.texto));
      } else if (it.tipo === 'laguna') {
        cuerpo.push(h('div', { class: 'laguna', role: 'note' }, [
          h('p', null, [h('span', { class: 'rot' }, t('ui.completo.laguna')), it.texto]),
          it.hoy ? h('p', { class: 'laguna-hoy' }, [h('span', { class: 'rot' }, t('ui.completo.hoy')), it.hoy]) : null
        ]));
      } else if (it.tipo === 'acot') {
        cuerpo.push(h('p', { class: 'acotacion' }, it.texto));
      } else if (it.tipo === 'epilogo') {
        cuerpo.push(h('h4', { class: 'epilogo' }, t('ui.completo.epilogo')));
      }
    });
    return h('section', { class: 'tablilla', id: base, 'aria-labelledby': base + '-tit' }, [
      h('header', { class: 'tablilla-cab' }, [
        h('h3', { id: base + '-tit', tabindex: '-1' }, tb.titulo || t('ui.completo.tablillas') + ' ' + romano(tb.n)),
        tb.sinopsis ? h('p', { class: 'tablilla-sinopsis' }, tb.sinopsis) : null
      ]),
      h('div', { class: 'versos' }, cuerpo),
      notas.length ? h('aside', { class: 'notas-tablilla', 'aria-label': t('ui.completo.notas') + ' · ' + (tb.titulo || romano(tb.n)) }, [
        h('h4', null, t('ui.completo.notas')),
        h('ol', null, notas.map(function (x) {
          return h('li', { id: x.id, tabindex: '-1' }, [
            h('a', { href: '#' + x.id + '-ref', class: 'nota-verso', onclick: function (ev) { ev.preventDefault(); irA(x.id + '-ref'); } }, x.ref || '*'),
            ' ', x.nota
          ]);
        }))
      ]) : null
    ]);
  }

  function vistaCompleto(id) {
    var x = completoPorId[id];
    var tx = textoPorId[id];
    if (!x) {
      return h('div', { class: 'texto-lector' }, [
        h('h2', { tabindex: '-1', class: 'foco-inicial' }, t('ui.textos.no_encontrado')),
        h('p', null, [t('ui.completo.no_encontrado', { id: id }), ' ', h('a', { href: '#textos' }, t('ui.textos.volver'))])
      ]);
    }
    var abierto = !window.matchMedia || window.matchMedia('(min-width: 961px)').matches;
    var indice = h('details', { class: 'indice', id: 'indice', open: abierto }, [
      h('summary', null, t('ui.textos.indice')),
      h('section', { class: 'indice-bloque' }, [
        h('h3', null, t('ui.completo.tablillas')),
        h('ol', { class: 'indice-pasajes' }, x.tablillas.map(function (tb) {
          return h('li', null, h('button', { type: 'button', class: 'boton-indice', id: 'ir-tablilla-' + tb.n, onclick: function () { irA('tablilla-' + tb.n + '-tit'); } }, tb.titulo || romano(tb.n)));
        }))
      ])
    ]);
    return h('article', { class: 'texto-lector texto-completo' }, [
      h('p', { class: 'migas' }, [
        h('a', { href: '#textos' }, t('ui.nav.textos')), h('span', { 'aria-hidden': 'true' }, ' / '),
        tx ? h('a', { href: '#t-' + tx.id }, tx.titulo) : x.titulo, h('span', { 'aria-hidden': 'true' }, ' / '),
        etqCompleto(x)
      ]),
      h('header', { class: 'texto-cab' }, [
        h('p', { class: 'tt-lengua' }, [etqCompleto(x), ' · ', t('ui.completo.versos', { n: contarVersos(x) })]),
        h('h2', { tabindex: '-1', class: 'foco-inicial' }, x.titulo),
        x.subtitulo ? h('p', { class: 'texto-version' }, x.subtitulo) : null,
        x.aviso ? h('p', { class: 'aviso-antigua', role: 'note', lang: 'es' }, [h('strong', null, t('ui.completo.aviso_titulo')), ' ', x.aviso]) : null,
        estado.idioma !== IDIOMA_ORIGINAL ? h('p', { class: 'aviso-solo-es', lang: estado.idioma }, t('ui.completo.solo_es')) : null,
        h('div', { class: 'texto-meta' }, [
          x.fuente ? h('p', { class: 'pasaje-fuente' }, [h('span', { class: 'rot' }, t('ui.textos.fuente')), x.fuente_url ? h('a', { href: x.fuente_url, rel: 'noopener', target: '_blank' }, x.fuente) : x.fuente]) : null,
          tx ? h('a', { class: 'boton', href: '#t-' + tx.id, id: 'volver-pasajes' }, [t('ui.completo.volver_texto'), icono('flecha')]) : null
        ]),
        x.presentacion ? h('details', { class: 'presentacion' }, [h('summary', null, t('ui.completo.presentacion')), parrafos(x.presentacion)]) : null
      ]),
      h('div', { class: 'lector' }, [
        h('aside', { class: 'lector-indice' }, indice),
        h('div', { class: 'lector-cuerpo', lang: 'es' }, x.tablillas.map(tablillaCompleta))
      ])
    ]);
  }

  /* --- Otras teorías (solo castellano) --- */
  function etqEstado(e) { return t('ui.teorias.estado_' + (ESTADOS_TEORIA.indexOf(e) >= 0 ? e : 'refutada')); }

  /** Corte de un cuerpo esférico: a la izquierda, lo que afirma la teoría (cáscara hueca); a la derecha, las capas medidas. */
  function corteInterior(x) {
    var R = 100, cx1 = 120, cx2 = 360, cy = 125;
    var capas = x.interior.capas.slice().sort(function (a, b) { return b.hasta - a.hasta; });
    var esc = R / x.interior.radio;
    var leyenda = [];
    var circulos = capas.map(function (c, i) {
      leyenda.push(h('li', null, [h('span', { class: 'capa-marca capa-' + i, 'aria-hidden': 'true' }), c.nombre, h('span', { class: 'capa-km' }, ' · ' + t('ui.teorias.km', { n: c.hasta.toLocaleString('es-ES') }))]));
      return s('circle', { class: 'capa capa-' + i, cx: cx2, cy: cy, r: Math.max(1.5, c.hasta * esc) });
    });
    var svg = s('svg', { class: 'corte', viewBox: '0 0 480 260', role: 'img', 'aria-label': t('ui.teorias.corte_aria', { nombre: x.nombre }) }, [
      s('circle', { class: 'corte-hueco', cx: cx1, cy: cy, r: R }),
      s('circle', { class: 'corte-coraza', cx: cx1, cy: cy, r: R - 9 }),
      s('circle', { class: 'corte-vacio', cx: cx1, cy: cy, r: R - 16 }),
      s('text', { class: 'corte-interrog', x: cx1, y: cy + 14, 'text-anchor': 'middle' }, '?'),
      s('text', { class: 'corte-etq', x: cx1, y: 252, 'text-anchor': 'middle' }, t('ui.teorias.corte_teoria')),
      circulos,
      s('text', { class: 'corte-etq', x: cx2, y: 252, 'text-anchor': 'middle' }, t('ui.teorias.corte_datos'))
    ]);
    return h('figure', { class: 'corte-figura' }, [
      svg,
      h('figcaption', null, [h('ol', { class: 'corte-leyenda' }, leyenda)])
    ]);
  }

  /** Escala horizontal con los valores de la prueba clave; la «teoría» y lo «medido» se distinguen por forma y color. */
  function escalaPrueba(p) {
    var vals = p.valores.map(function (v) { return v.valor; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var paso = pasoEscala((hi - lo) * 1.2 || Math.abs(hi) || 1);
    var min = Math.floor((lo - paso * 0.5) / paso) * paso, max = Math.ceil((hi + paso * 0.5) / paso) * paso;
    var fmt = p.formato === 'anio'
      ? function (v) { return formatearAnio(Math.round(v), false, traduccion); }
      : function (v) { return (Math.round(v * 1e6) / 1e6).toLocaleString('es-ES'); };
    var marcas = [];
    // Las marcas del eje que caen casi encima de un valor se omiten para que no se solapen sus etiquetas.
    for (var m = min; m <= max + paso * 1e-6; m += paso) {
      var mm = Math.round(m / paso) * paso;
      if (!vals.some(function (v) { return Math.abs(v - mm) < (max - min) * 0.04; })) marcas.push(mm);
    }
    return h('div', { class: 'escala' + (p.formato === 'anio' ? ' escala-anios' : ''), role: 'img', 'aria-label': p.valores.map(function (v) { return v.etiqueta + ': ' + fmt(v.valor); }).join('; ') }, [
      h('div', { class: 'escala-pista', 'aria-hidden': 'true' }, [
        marcas.map(function (m2) { return h('span', { class: 'escala-marca', style: 'left:' + posicionEscala(m2, min, max) + '%' }, fmt(m2)); }),
        p.valores.map(function (v, i) {
          var pos = posicionEscala(v.valor, min, max);
          return h('span', { class: 'escala-punto ep-' + v.tipo + (i % 2 ? ' abajo' : '') + (pos < 15 ? ' al-inicio' : pos > 85 ? ' al-final' : ''), style: 'left:' + pos + '%' }, [
            h('span', { class: 'ep-valor' }, fmt(v.valor)),
            h('span', { class: 'ep-etq' }, v.etiqueta)
          ]);
        })
      ]),
      h('ul', { class: 'escala-lista' }, p.valores.map(function (v) {
        return h('li', { class: 'ep-' + v.tipo }, [h('span', { class: 'ep-signo', 'aria-hidden': 'true' }), h('strong', null, fmt(v.valor)), ' ', v.etiqueta]);
      }))
    ]);
  }

  function tarjetaTeoria(x) {
    return h('li', null, h('a', { class: 'teoria-tarjeta', href: '#te-' + x.id }, [
      h('span', { class: 'sello-estado se-' + x.estado }, etqEstado(x.estado)),
      h('span', { class: 'tt-titulo' }, x.nombre),
      x.lema ? h('span', { class: 'tt-version' }, x.lema) : null,
      h('span', { class: 'tt-pie' }, [
        h('span', { class: 'tt-num' }, t('ui.teorias.n_afirmaciones', { n: x.afirmaciones.length })),
        x.hitos.length ? h('span', null, t('ui.teorias.desde', { anio: x.hitos[0].anio })) : null,
        icono('flecha')
      ])
    ]));
  }

  function vistaTeorias() {
    return h('div', { class: 'teorias' }, [
      h('header', { class: 'cab-vista' }, [h('h2', null, t('ui.nav.teorias')), h('p', { class: 'entradilla' }, t('ui.teorias.entradilla'))]),
      TE.length ? h('ul', { class: 'lista-teorias' }, TE.map(tarjetaTeoria)) : h('p', { class: 'vacio' }, t('ui.teorias.vacio')),
      h('p', { class: 'nota' }, t('ui.teorias.nota_idioma'))
    ]);
  }

  function vistaTeoria(id) {
    var x = teoriaPorId[id];
    if (!x) {
      return h('div', { class: 'teoria' }, [
        h('h2', { tabindex: '-1', class: 'foco-inicial' }, t('ui.teorias.no_encontrada')),
        h('p', null, h('a', { href: '#teorias' }, t('ui.teorias.volver')))
      ]);
    }
    var rel = x.relaciones.filter(function (r) { return porId[r.id]; });
    return h('article', { class: 'teoria', lang: 'es' }, [
      h('p', { class: 'migas' }, [h('a', { href: '#teorias' }, t('ui.nav.teorias')), h('span', { 'aria-hidden': 'true' }, ' / '), x.nombre]),
      h('header', { class: 'teoria-cab' + (x.interior ? '' : ' sin-corte') }, [
        h('div', { class: 'teoria-cab-txt' }, [
          h('span', { class: 'sello-estado se-' + x.estado }, etqEstado(x.estado)),
          h('h2', { tabindex: '-1', class: 'foco-inicial' }, x.nombre),
          x.lema ? h('p', { class: 'teoria-lema' }, x.lema) : null,
          x.resumen ? h('p', { class: 'teoria-resumen' }, x.resumen) : null
        ]),
        x.interior ? corteInterior(x) : null
      ]),
      x.veredicto ? h('p', { class: 'veredicto-teoria', role: 'note' }, [h('span', { class: 'rot' }, t('ui.teorias.veredicto')), x.veredicto]) : null,

      h('section', { class: 'teoria-bloque teoria-origen' }, [
        h('h3', null, t('ui.teorias.origen')),
        h('div', { class: 'origen-rejilla' }, [
          h('div', { class: 'origen-txt' }, [
            parrafos(x.origen),
            x.autores.length ? h('ul', { class: 'teoria-autores' }, x.autores.map(function (a) {
              return h('li', null, [icono('persona'), h('span', null, [h('strong', null, a.nombre), a.obra ? [' · ', h('cite', null, a.obra)] : null, a.anio !== null ? ' (' + a.anio + ')' : null])]);
            })) : null
          ]),
          x.hitos.length ? h('ol', { class: 'hitos-teoria' }, x.hitos.map(function (hh) {
            return h('li', null, [h('span', { class: 'ht-anio' }, formatearAnio(hh.anio, false, traduccion)), h('span', { class: 'ht-txt' }, hh.texto)]);
          })) : null
        ])
      ]),

      x.afirmaciones.length ? h('section', { class: 'teoria-bloque' }, [
        h('h3', null, t('ui.teorias.afirmaciones')),
        h('ol', { class: 'duelos' }, x.afirmaciones.map(function (a, i) {
          return h('li', { class: 'duelo' }, [
            h('div', { class: 'duelo-afirma' }, [
              h('span', { class: 'duelo-n', 'aria-hidden': 'true' }, String(i + 1)),
              h('span', { class: 'rot' }, t('ui.ficha.afirmacion')),
              h('p', null, a.afirmacion),
              a.autor ? h('p', { class: 'duelo-autor' }, a.autor) : null
            ]),
            h('div', { class: 'duelo-prueba' }, [
              h('span', { class: 'chip-evidencia ev-' + a.evidencia }, t('ui.teorias.ev_' + a.evidencia)),
              h('p', null, a.replica),
              a.fuente ? h('p', { class: 'fuente' }, a.fuente) : null
            ])
          ]);
        }))
      ]) : null,

      x.prueba ? h('section', { class: 'teoria-bloque prueba-clave' }, [
        h('h3', null, t('ui.teorias.prueba_clave')),
        h('p', { class: 'prueba-titulo' }, x.prueba.titulo),
        x.prueba.valores.length ? escalaPrueba(x.prueba) : null,
        parrafos(x.prueba.texto),
        x.prueba.fuente ? h('p', { class: 'fuente' }, [h('span', { class: 'rot' }, t('ui.textos.fuente')), x.prueba.fuente]) : null
      ]) : null,

      h('div', { class: 'teoria-dos' }, [
        x.por_que_atrae ? h('section', { class: 'teoria-bloque' }, [h('h3', null, t('ui.teorias.por_que_atrae')), parrafos(x.por_que_atrae)]) : null,
        (x.relacion_sumer || rel.length || x.enlaces_texto.length) ? h('section', { class: 'teoria-bloque teoria-sumer' }, [
          h('h3', null, t('ui.teorias.relacion_sumer')),
          parrafos(x.relacion_sumer),
          rel.length || x.enlaces_texto.length ? h('ul', { class: 'chips' }, rel.map(function (r) {
            return h('li', null, h('a', { class: 'chip', href: '#e-' + r.id }, [porId[r.id].nombre, r.tipo ? h('span', { class: 'chip-tipo' }, ' · ' + r.tipo) : null]));
          }).concat(x.enlaces_texto.map(function (e) { return h('li', null, h('a', { class: 'chip chip-texto', href: e.href }, [icono('libro'), e.texto])); }))) : null
        ]) : null
      ]),

      x.fuentes.length ? h('section', { class: 'teoria-bloque' }, [
        h('h3', null, t('ui.teorias.fuentes')),
        h('ul', { class: 'biblio' }, x.fuentes.map(function (f) {
          return referencia({ titulo: f.titulo + (f.obra ? ', ' + f.obra : ''), autor: f.autor, anio: f.anio, url: f.url });
        }))
      ]) : null,
      estado.idioma !== IDIOMA_ORIGINAL ? h('p', { class: 'aviso-solo-es', lang: estado.idioma }, t('ui.teorias.nota_idioma')) : null
    ]);
  }

  /* --- Regla temporal (hallazgos, hitos de la disciplina) --- */
  function regla(items, ini, fin, paso, aria) {
    var marcas = reglaTemporal(items, ini, fin, 6);
    var niveles = marcas.reduce(function (m, x) { return Math.max(m, x.nivel + 1); }, 1);
    var ticks = marcasEje(ini, fin, paso);
    return h('div', { class: 'regla', role: 'img', 'aria-label': aria, style: '--niveles:' + niveles }, h('div', { class: 'regla-pista' }, [
      h('span', { class: 'regla-eje', 'aria-hidden': 'true' }),
      ticks.map(function (v, i) {
        return h('span', { class: 'regla-marca' + (i % 2 ? ' menor' : ''), style: 'left:' + posicionEnRango(v, ini, fin) + '%', 'aria-hidden': 'true' }, String(v));
      }),
      marcas.map(function (m) {
        return h('span', { class: 'regla-punto', style: 'left:' + m.pos + '%;--nivel:' + m.nivel, 'aria-hidden': 'true' }, String(m.indice));
      })
    ]));
  }

  /* --- Lecturas actuales --- */
  function vistaActual() {
    var cab = h('header', { class: 'cab-vista' }, [h('h2', null, t('ui.nav.actual')), h('p', { class: 'entradilla' }, t('ui.actual.entradilla'))]);
    if (!ACT.corrientes.length && !ACT.hallazgos.length && !ACT.recepcion.length) return h('div', { class: 'actual-vista' }, [cab, h('p', { class: 'vacio' }, t('ui.actual.vacio'))]);

    var porCorriente = Object.create(null);
    ACT.entradas.forEach(function (x) {
      if (!porId[x.id]) return;
      x.corrientes.forEach(function (c) { (porCorriente[c] = porCorriente[c] || []).push(x.id); });
    });

    var anios = ACT.hallazgos.map(function (x) { return x.anio; });
    var ini = Math.min.apply(null, [2003].concat(anios)), fin = Math.max.apply(null, [2025].concat(anios));

    var conteo = contar(ACT.recepcion, 'tipo');
    var tiposPresentes = TIPOS_OBRA.filter(function (tp) { return conteo[tp]; });
    if (tiposPresentes.indexOf(estado.filtroRecepcion) < 0) estado.filtroRecepcion = '';
    var listaObras = h('ul', { class: 'obras-recepcion', id: 'recepcion-lista', 'aria-live': 'polite' });
    var botones = h('div', { class: 'segmentos', role: 'group', 'aria-label': t('ui.actual.tipo') }, [''].concat(tiposPresentes).map(function (tp) {
      return h('button', {
        type: 'button', class: 'seg', id: 'rec-' + (tp || 'todas'), 'aria-pressed': String(estado.filtroRecepcion === tp),
        onclick: function () { estado.filtroRecepcion = tp; pintarObras(); }
      }, [tp ? etqObra(tp) : t('ui.actual.todos'), h('span', { class: 'num' }, String(tp ? conteo[tp] : ACT.recepcion.length))]);
    }));
    function pintarObras() {
      Array.prototype.forEach.call(botones.children, function (b) { b.setAttribute('aria-pressed', String(b.id === 'rec-' + (estado.filtroRecepcion || 'todas'))); });
      vaciar(listaObras);
      var l = filtrarRecepcion(ACT.recepcion, estado.filtroRecepcion);
      if (!l.length) { listaObras.appendChild(h('li', { class: 'vacio' }, t('ui.actual.recepcion_vacio'))); return; }
      l.forEach(function (o) {
        listaObras.appendChild(h('li', { class: 'obra' + (o.influencia_sitchin ? ' con-sitchin' : '') }, [
          h('p', { class: 'obra-meta' }, [h('span', { class: 'obra-tipo' }, etqObra(o.tipo)), o.anio !== null ? h('span', { class: 'obra-anio' }, String(o.anio)) : null]),
          h('h4', null, h('cite', null, o.obra)),
          o.autor ? h('p', { class: 'obra-autor' }, o.autor) : null,
          o.influencia_sitchin ? h('p', { class: 'sello-sitchin' }, [icono('aviso'), t('ui.actual.sitchin')]) : null,
          parrafos(o.descripcion),
          enlacesEntradas(o.entradas)
        ]));
      });
    }
    pintarObras();

    return h('div', { class: 'actual-vista' }, [
      cab,
      ACT.corrientes.length ? h('section', { class: 'seccion', 'aria-labelledby': 'sec-corrientes' }, [
        h('h3', { class: 'seccion-titulo', id: 'sec-corrientes' }, t('ui.actual.corrientes')),
        h('div', { class: 'corrientes' }, ACT.corrientes.map(function (c) {
          return h('article', { class: 'corriente', id: 'corriente-' + c.id }, [
            h('h4', null, c.nombre),
            parrafos(c.descripcion),
            porCorriente[c.id] ? h('div', { class: 'mini-bloque' }, [h('p', { class: 'rot' }, t('ui.actual.entradas')), enlacesEntradas(porCorriente[c.id])]) : null,
            c.autores_clave.length ? h('div', { class: 'mini-bloque' }, [h('p', { class: 'rot' }, t('ui.actual.autores_clave')), h('ul', { class: 'autores-clave' }, c.autores_clave.map(function (a) { return h('li', null, a); }))]) : null
          ]);
        }))
      ]) : null,
      ACT.hallazgos.length ? h('section', { class: 'seccion', 'aria-labelledby': 'sec-hallazgos' }, [
        h('h3', { class: 'seccion-titulo', id: 'sec-hallazgos' }, t('ui.actual.hallazgos')),
        h('p', { class: 'entradilla' }, t('ui.actual.hallazgos_entradilla', { inicio: ini, fin: fin })),
        regla(ACT.hallazgos, ini, fin, 5, t('ui.actual.regla', { inicio: ini, fin: fin })),
        h('ol', { class: 'linea-hitos' }, ACT.hallazgos.map(function (x, i) {
          return h('li', null, [
            h('span', { class: 'lh-num', 'aria-hidden': 'true' }, String(i + 1)),
            h('div', { class: 'lh-cuerpo' }, [
              h('p', { class: 'lh-anio' }, String(x.anio)),
              h('h4', null, x.titulo),
              parrafos(x.descripcion),
              enlacesEntradas(x.entradas),
              x.url ? enlaceExterno(x.url, t('ui.actual.mas')) : null
            ])
          ]);
        }))
      ]) : null,
      ACT.recepcion.length ? h('section', { class: 'seccion', 'aria-labelledby': 'sec-recepcion' }, [
        h('h3', { class: 'seccion-titulo', id: 'sec-recepcion' }, t('ui.actual.recepcion')),
        h('p', { class: 'entradilla' }, t('ui.actual.recepcion_entradilla')),
        botones,
        listaObras
      ]) : null
    ]);
  }

  /* --- Autores: asiriólogos y defensores de los antiguos astronautas --- */
  function subnavAutores(actual) {
    return h('nav', { class: 'subnav', 'aria-label': t('ui.autores.grupos') }, [
      h('a', { href: '#asiriologos', class: 'subnav-item', 'aria-current': actual === 'asiriologos' ? 'page' : null }, t('ui.nav.asiriologos')),
      h('a', { href: '#autores', class: 'subnav-item subnav-astro', 'aria-current': actual === 'autores' ? 'page' : null }, t('ui.autores.defensores'))
    ]);
  }

  function vistaAsiriologos(destacado) {
    var cab = h('header', { class: 'cab-vista' }, [h('h2', null, t('ui.nav.asiriologos')), h('p', { class: 'entradilla' }, t('ui.asiriologos.entradilla'))]);
    if (!AS.autores.length) return h('div', { class: 'asiriologos' }, [subnavAutores('asiriologos'), cab, h('p', { class: 'vacio' }, t('ui.asiriologos.vacio'))]);
    var anios = AS.hitos.map(function (x) { return x.anio; });
    var ini = Math.min.apply(null, [1800].concat(anios));
    ini = Math.floor(ini / 25) * 25;
    var fin = Math.max.apply(null, [new Date().getFullYear()].concat(anios));
    var primero = anios.length ? anios[0] : ini;
    return h('div', { class: 'asiriologos' }, [
      subnavAutores('asiriologos'),
      cab,
      AS.hitos.length ? h('section', { class: 'seccion', 'aria-labelledby': 'sec-hitos' }, [
        h('h3', { class: 'seccion-titulo', id: 'sec-hitos' }, t('ui.asiriologos.hitos', { inicio: primero })),
        regla(AS.hitos, ini, fin, 25, t('ui.asiriologos.regla', { inicio: ini, fin: fin })),
        h('ol', { class: 'linea-hitos compacta' }, AS.hitos.map(function (x, i) {
          return h('li', null, [h('span', { class: 'lh-num', 'aria-hidden': 'true' }, String(i + 1)),
            h('div', { class: 'lh-cuerpo' }, [h('p', { class: 'lh-anio' }, String(x.anio)), h('p', null, x.evento)])]);
        }))
      ]) : null,
      agruparPorEtapa(AS.autores).map(function (g) {
        return h('section', { class: 'seccion etapa etapa-' + (g.etapa || 'otros'), 'aria-labelledby': 'etapa-' + (g.etapa || 'otros') }, [
          h('h3', { class: 'seccion-titulo', id: 'etapa-' + (g.etapa || 'otros') }, [etqEtapa(g.etapa), h('span', { class: 'num' }, String(g.autores.length))]),
          h('div', { class: 'fichas-asiriologo' }, g.autores.map(function (a) {
            var obras = a.obras.slice().sort(function (x, y) { return (x.anio || 0) - (y.anio || 0); });
            return h('article', { class: 'asiriologo' + (a.id === destacado ? ' destacado' : ''), id: 'asiriologo-' + a.id, tabindex: '-1' }, [
              h('header', { class: 'asir-cab' }, [h('h4', null, a.nombre), a.vida ? h('span', { class: 'vida' }, a.vida) : null]),
              (a.pais || a.institucion) ? h('p', { class: 'asir-lugar' }, [a.pais, a.institucion].filter(Boolean).join(' · ')) : null,
              a.especialidad ? h('p', { class: 'asir-esp' }, a.especialidad) : null,
              a.aportaciones.length ? h('div', { class: 'mini-bloque' }, [h('p', { class: 'rot' }, t('ui.asiriologos.aportaciones')), listaTexto(a.aportaciones)]) : null,
              obras.length ? h('div', { class: 'mini-bloque' }, [h('p', { class: 'rot' }, t('ui.asiriologos.obras')), h('ul', { class: 'obras' }, obras.map(function (o) {
                return h('li', null, [o.anio !== null ? h('span', { class: 'anio' }, String(o.anio)) : h('span'), h('cite', null, o.titulo)]);
              }))]) : null,
              a.postura ? h('div', { class: 'mini-bloque' }, [h('p', { class: 'rot' }, t('ui.asiriologos.postura')), parrafos(a.postura)]) : null,
              a.entradas.some(function (id) { return porId[id]; }) ? h('div', { class: 'mini-bloque' }, [h('p', { class: 'rot' }, t('ui.asiriologos.entradas')), enlacesEntradas(a.entradas)]) : null,
              a.url ? enlaceExterno(a.url, t('ui.asiriologos.enlace')) : null
            ]);
          }))
        ]);
      })
    ]);
  }

  /* --- Cronologías --- */
  function svgEje(lin, alto, yEje, paso, aprox) {
    var g = s('g', { class: 'eje' });
    g.appendChild(s('line', { x1: lin.escala(lin.inicio), x2: lin.escala(lin.fin), y1: yEje, y2: yEje, class: 'eje-linea' }));
    marcasEje(lin.inicio, lin.fin, paso).forEach(function (v) {
      var x = lin.escala(v);
      g.appendChild(s('line', { x1: x, x2: x, y1: 0, y2: yEje, class: 'eje-guia' }));
      g.appendChild(s('line', { x1: x, x2: x, y1: yEje, y2: yEje + 5, class: 'eje-linea' }));
      g.appendChild(s('text', { x: x, y: yEje + 18, class: 'eje-txt', 'text-anchor': 'middle' }, aprox ? (v < 0 ? String(-v) : String(v)) : String(v)));
    });
    return g;
  }

  function cronologiaAntigua() {
    var items = C.periodos.filter(function (p) { return p.inicio !== null; }).map(function (p) {
      return { id: p.id, etiqueta: p.nombre, inicio: p.inicio, fin: p.fin !== null ? p.fin : p.inicio, datos: p };
    });
    if (!items.length) return h('p', { class: 'vacio' }, t('ui.cronologia.sin_periodos'));
    var ini = Math.floor(Math.min.apply(null, items.map(function (x) { return x.inicio; })) / 500) * 500;
    var fin = Math.ceil(Math.max.apply(null, items.map(function (x) { return x.fin; })) / 500) * 500;
    var lin = disponerLinea(items, { pxPorAnio: 0.32, inicio: ini, fin: fin, margen: 28, anchoCaracter: 7.4, separacion: 12 });
    var alto = 34 + lin.carriles * 46 + 40;
    var yEje = alto - 30;
    var conteo = contar(C.entradas, 'periodo');
    var svg = s('svg', {
      class: 'linea', width: lin.ancho, height: alto, viewBox: '0 0 ' + lin.ancho + ' ' + alto,
      role: 'group', 'aria-label': t('ui.cronologia.aria_antigua', { inicio: anio(ini), fin: anio(fin) })
    });
    svg.appendChild(svgEje(lin, alto, yEje, 500, true));
    svg.appendChild(s('text', { x: lin.ancho - 28, y: yEje + 18, class: 'eje-txt eje-unidad', 'text-anchor': 'end' }, t('ui.fecha.unidad_ac')));
    lin.items.forEach(function (it) {
      var y = 14 + it.carril * 46;
      var p = it.datos;
      var n = conteo[p.id] || 0;
      var g = s('g', {
        class: 'periodo' + (estado.filtros.periodo === p.id ? ' activo' : ''), tabindex: '0', role: 'button',
        'aria-label': t('ui.cronologia.aria_periodo', { nombre: p.nombre, rango: rango(p.inicio, p.fin), entradas: textoEntradas(n) })
      }, [
        s('title', null, p.nombre + ' · ' + rango(p.inicio, p.fin)),
        s('rect', { x: it.x, y: y + 18, width: it.w, height: 14, rx: 2, class: 'barra' }),
        s('text', { x: it.x, y: y + 12, class: 'barra-txt' }, p.nombre),
        n ? s('text', { x: it.x + it.w + 4, y: y + 29, class: 'barra-num' }, String(n)) : null
      ]);
      var ir = function () { estado.filtros.periodo = p.id; location.hash = '#catalogo'; };
      g.addEventListener('click', ir);
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ir(); } });
      svg.appendChild(g);
    });
    return svg;
  }

  function cronologiaModerna() {
    var items = A.cronologia.map(function (hito, i) { return { id: 'h' + i, etiqueta: String(hito.anio), inicio: hito.anio, datos: { n: i + 1, h: hito } }; });
    if (!items.length) return null;
    var ini = Math.floor(Math.min.apply(null, items.map(function (x) { return x.inicio; })) / 10) * 10;
    var fin = Math.ceil((Math.max.apply(null, items.map(function (x) { return x.inicio; })) + 1) / 10) * 10;
    var lin = disponerLinea(items, { pxPorAnio: 16, inicio: ini, fin: fin, margen: 28, anchoCaracter: 0, minimo: 0, separacion: 22 });
    var alto = 26 + lin.carriles * 26 + 40;
    var yEje = alto - 30;
    var svg = s('svg', {
      class: 'linea moderna', width: lin.ancho, height: alto, viewBox: '0 0 ' + lin.ancho + ' ' + alto,
      role: 'img', 'aria-label': t('ui.cronologia.aria_moderna', { inicio: ini, fin: fin })
    });
    svg.appendChild(svgEje(lin, alto, yEje, 10, false));
    lin.items.forEach(function (it) {
      var y = 14 + it.carril * 26;
      svg.appendChild(s('g', { class: 'hito' }, [
        s('line', { x1: it.x, x2: it.x, y1: y + 9, y2: yEje, class: 'hito-tallo' }),
        s('circle', { cx: it.x, cy: y, r: 9, class: 'hito-punto' }),
        s('text', { x: it.x, y: y + 4, class: 'hito-num', 'text-anchor': 'middle' }, String(it.datos.n))
      ]));
    });
    return svg;
  }

  function vistaCronologia() {
    var modern = cronologiaModerna();
    var conteo = contar(C.entradas, 'periodo');
    return h('div', { class: 'cronologia' }, [
      h('header', { class: 'cab-vista' }, [
        h('h2', null, t('ui.nav.cronologia')),
        h('p', { class: 'entradilla' }, t('ui.cronologia.entradilla'))
      ]),
      h('div', { class: 'desliza', tabindex: '0', role: 'region', 'aria-label': t('ui.cronologia.region_antigua') }, cronologiaAntigua()),
      h('p', { class: 'pista' }, t('ui.cronologia.pista')),
      h('ol', { class: 'periodos' }, C.periodos.map(function (p) {
        var n = conteo[p.id] || 0;
        return h('li', null, [
          h('p', { class: 'p-cab' }, [h('strong', null, p.nombre), ' ', h('span', { class: 'p-rango' }, rango(p.inicio, p.fin))]),
          p.descripcion ? h('p', null, p.descripcion) : null,
          n ? h('button', {
            type: 'button', id: 'periodo-' + p.id, class: 'boton-texto',
            onclick: function () { estado.filtros.periodo = p.id; location.hash = '#catalogo'; }
          }, n === 1 ? t('ui.cronologia.ver_uno') : t('ui.cronologia.ver_varios', { n: n })) : null
        ]);
      })),
      modern ? h('section', { class: 'cron-moderna astro-zona' }, [
        h('h2', null, t('ui.cronologia.moderna_titulo')),
        aviso(t('ui.cronologia.moderna_aviso')),
        h('div', { class: 'desliza', tabindex: '0', role: 'region', 'aria-label': t('ui.cronologia.region_moderna') }, modern),
        h('ol', { class: 'hitos' }, A.cronologia.map(function (hito, i) {
          return h('li', null, [h('span', { class: 'hito-n', 'aria-hidden': 'true' }, String(i + 1)), h('strong', null, String(hito.anio)), ' ', hito.evento]);
        }))
      ]) : null
    ]);
  }

  /* --- Mapa --- */
  var FORMAS = { mito: 'rect', deidad: 'circle', concepto: 'diamond' };
  function formaNodo(cat, x, y) {
    var r = 9;
    if (FORMAS[cat] === 'rect') return s('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, rx: 2, class: 'forma' });
    if (FORMAS[cat] === 'diamond') return s('polygon', { points: [x, y - r - 2, x + r + 2, y, x, y + r + 2, x - r - 2, y].join(' '), class: 'forma' });
    return s('circle', { cx: x, cy: y, r: r, class: 'forma' });
  }

  function vistaMapa() {
    var grafo = construirGrafo(C.entradas);
    var W = Math.round(Math.max(720, Math.min(1180, vista.clientWidth || 0)));
    var H = Math.round(Math.max(420, Math.min(640, W * 0.5, 180 + 60 * grafo.nodos.length)));
    var pos = disponerGrafo(grafo, { ancho: W, alto: H, semilla: 7, margen: 70 });
    var svg = s('svg', { class: 'grafo', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-label': t('ui.mapa.titulo') });
    var gA = s('g', { class: 'aristas' }), gN = s('g', { class: 'nodos' });
    var elNodo = {}, elArista = [];
    grafo.aristas.forEach(function (a) {
      var p = pos[a.origen], q = pos[a.destino];
      var l = s('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: 'arista' }, a.tipos.length ? s('title', null, a.tipos.join(', ')) : null);
      elArista.push({ a: a, el: l });
      gA.appendChild(l);
    });
    function resaltar(id) {
      svg.classList.toggle('resaltado', !!id);
      var vs = Object.create(null);
      if (id) { vs[id] = true; vecinos(grafo, id).forEach(function (v) { vs[v.id] = true; }); }
      Object.keys(elNodo).forEach(function (k) { elNodo[k].classList.toggle('vecino', !!vs[k]); });
      elArista.forEach(function (x) { x.el.classList.toggle('vecino', !!id && (x.a.origen === id || x.a.destino === id)); });
    }
    grafo.nodos.forEach(function (nd) {
      var p = pos[nd.id];
      var derecha = p.x < W * 0.72;
      var alt = !!astroPorId[nd.id];
      var g = s('a', { href: '#e-' + nd.id, class: 'nodo cat-' + (nd.categoria || 'otro') + (alt ? ' con-alt' : ''), 'aria-label': nd.nombre + (nd.categoria ? ', ' + etqCat(nd.categoria) : '') + (alt ? ', ' + t('ui.mapa.con_alt') : '') }, [
        alt ? s('circle', { cx: p.x, cy: p.y, r: 16, class: 'halo' }) : null,
        formaNodo(nd.categoria, p.x, p.y),
        s('text', { x: derecha ? p.x + (alt ? 21 : 15) : p.x - (alt ? 21 : 15), y: p.y + 4, class: 'nodo-txt', 'text-anchor': derecha ? 'start' : 'end' }, nd.nombre)
      ]);
      ['mouseenter', 'focus'].forEach(function (ev) { g.addEventListener(ev, function () { resaltar(nd.id); }); });
      ['mouseleave', 'blur'].forEach(function (ev) { g.addEventListener(ev, function () { resaltar(null); }); });
      elNodo[nd.id] = g;
      gN.appendChild(g);
    });
    svg.appendChild(gA);
    svg.appendChild(gN);

    return h('div', { class: 'mapa' }, [
      h('header', { class: 'cab-vista' }, [
        h('h2', null, t('ui.mapa.titulo')),
        h('p', { class: 'entradilla' }, t('ui.mapa.entradilla'))
      ]),
      h('ul', { class: 'leyenda' }, CATEGORIAS.map(function (c) {
        return h('li', null, [h('span', { class: 'ley ley-' + c, 'aria-hidden': 'true' }), etqCat(c)]);
      }).concat([
        h('li', null, [h('span', { class: 'ley ley-alt', 'aria-hidden': 'true' }), t('ui.mapa.leyenda_alt')])
      ])),
      grafo.nodos.length
        ? h('div', { class: 'desliza desliza-grafo', tabindex: '0', role: 'region', 'aria-label': t('ui.mapa.region') }, svg)
        : h('p', { class: 'vacio' }, t('ui.mapa.vacio')),
      h('p', { class: 'pista' }, t('ui.cronologia.pista')),
      h('p', { class: 'nota' }, t('ui.mapa.nota', { aristas: grafo.aristas.length, nodos: grafo.nodos.length }))
    ]);
  }

  /* --- Defensores de los antiguos astronautas y método --- */
  function vistaAutores() {
    var m = A.metodo;
    return h('div', { class: 'autores-vista' }, [
      subnavAutores('autores'),
      h('div', { class: 'autores astro-zona' }, [
        h('header', { class: 'cab-vista' }, [
          h('h2', null, t('ui.autores.titulo')),
          aviso(t('ui.autores.aviso'))
        ]),
        A.autores.length ? h('div', { class: 'fichas-autor' }, A.autores.map(function (a) {
          var obras = a.obras.slice().sort(function (x, y) { return (x.anio || 0) - (y.anio || 0); });
          return h('article', { class: 'autor', id: 'autor-' + a.id }, [
            h('h3', null, [a.nombre, a.vida ? h('span', { class: 'vida' }, ' ' + a.vida) : null]),
            a.formacion ? h('p', { class: 'formacion' }, [h('span', { class: 'rot' }, t('ui.autores.formacion')), a.formacion]) : null,
            a.tesis ? h('p', { class: 'tesis' }, [h('span', { class: 'rot' }, t('ui.autores.tesis')), a.tesis]) : null,
            obras.length ? h('ul', { class: 'obras' }, obras.map(function (o) {
              return h('li', null, [o.anio !== null ? h('span', { class: 'anio' }, String(o.anio)) : h('span'), h('cite', null, o.titulo)]);
            })) : null
          ]);
        })) : h('p', { class: 'vacio' }, t('ui.autores.vacio'))
      ]),
      (m.errores_frecuentes.length || m.por_que_atrae) ? h('section', { class: 'metodo' }, [
        h('h2', null, t('ui.autores.metodo')),
        m.errores_frecuentes.length ? h('div', null, [h('h3', null, t('ui.autores.errores')), listaTexto(m.errores_frecuentes, true)]) : null,
        m.por_que_atrae ? h('div', null, [h('h3', null, t('ui.autores.atrae')), parrafos(m.por_que_atrae)]) : null
      ]) : null
    ]);
  }

  /* --- Glosario --- */
  function vistaGlosario() {
    var entrada = h('input', { id: 'glosario-buscar', type: 'search', name: 'glosario-buscar', value: estado.filtroGlosario, autocomplete: 'off', spellcheck: 'false' });
    var lista = h('dl', { class: 'glosario-lista' });
    var ordenado = ordenarGlosario(C.glosario, estado.idioma);
    function pintarG() {
      vaciar(lista);
      estado.filtroGlosario = entrada.value;
      var q = normalizar(entrada.value);
      var items = ordenado.filter(function (g) { return !q || normalizar(g.termino + ' ' + g.definicion).indexOf(q) >= 0; });
      if (!items.length) { anadir(lista, h('dt', { class: 'vacio' }, t('ui.glosario.vacio'))); return; }
      items.forEach(function (g) { anadir(lista, h('div', { class: 'glosario-fila' }, [h('dt', null, g.termino), h('dd', null, g.definicion)])); });
    }
    entrada.addEventListener('input', pintarG);
    pintarG();
    return h('div', { class: 'glosario' }, [
      h('header', { class: 'cab-vista' }, [h('h2', null, t('ui.nav.glosario'))]),
      h('div', { class: 'campo campo-buscar' }, [h('label', { for: 'glosario-buscar' }, t('ui.glosario.filtrar')), entrada]),
      lista
    ]);
  }

  /* --- Enrutado --- */
  function pintar(cambioDeVista) {
    var r = parsearHash(location.hash);
    estado.vista = r;
    raizApp.setAttribute('data-vista', r.vista);
    marcarNav(r.vista);
    actualizarContexto();
    var y = window.scrollY;
    var contenido;
    if (!C.entradas.length && !A.entradas.length && r.vista !== 'glosario') {
      contenido = h('p', { class: 'vacio' }, t('ui.general.sin_datos'));
    } else if (r.vista === 'ficha') contenido = vistaFicha(r.id);
    else if (r.vista === 'texto') contenido = vistaTexto(r.id);
    else if (r.vista === 'completo') contenido = vistaCompleto(r.id);
    else if (r.vista === 'teoria') contenido = vistaTeoria(r.id);
    else if (r.vista === 'teorias') contenido = vistaTeorias();
    else if (r.vista === 'textos') contenido = vistaTextos();
    else if (r.vista === 'cronologia') contenido = vistaCronologia();
    else if (r.vista === 'mapa') contenido = vistaMapa();
    else if (r.vista === 'actual') contenido = vistaActual();
    else if (r.vista === 'asiriologos') contenido = vistaAsiriologos(r.id);
    else if (r.vista === 'autores') contenido = vistaAutores();
    else if (r.vista === 'glosario') contenido = vistaGlosario();
    else contenido = vistaCatalogo();
    if (cambioDeVista) contenido.classList.add('vista-entra');
    vaciar(vista).appendChild(contenido);
    var nombre;
    if (r.vista === 'ficha') nombre = porId[r.id] ? porId[r.id].nombre : t('ui.ficha.titulo');
    else if (r.vista === 'texto') nombre = textoPorId[r.id] ? textoPorId[r.id].titulo : t('ui.nav.textos');
    else if (r.vista === 'teoria') nombre = teoriaPorId[r.id] ? teoriaPorId[r.id].nombre : t('ui.nav.teorias');
    else if (r.vista === 'completo') nombre = completoPorId[r.id] ? completoPorId[r.id].titulo + ' (' + etqCompleto(completoPorId[r.id]) + ')' : t('ui.nav.textos');
    else nombre = t('ui.nav.' + r.vista);
    document.title = nombre + ' · ' + t('ui.sitio.titulo');

    var destino = r.vista === 'asiriologos' && r.id ? document.getElementById('asiriologo-' + r.id) : null;
    if (pendienteBuscar && r.vista === 'catalogo' && buscador) {
      pendienteBuscar = false;
      window.scrollTo(0, 0);
      buscador.focus();
    } else if (destino && (cambioDeVista || !estado.yaDestacado)) {
      estado.yaDestacado = true;
      destino.scrollIntoView({ block: 'start' });
      destino.focus({ preventScroll: true });
    } else if (cambioDeVista) {
      if (r.vista === 'catalogo') window.scrollTo(0, 0);
      else {
        var barra = document.getElementById('barra');
        var arriba = vista.getBoundingClientRect().top + window.scrollY - (barra ? barra.offsetHeight : 0) - 8;
        if (window.scrollY > arriba) window.scrollTo(0, Math.max(0, arriba));
      }
      var foco = vista.querySelector('.foco-inicial') || vista.querySelector('h2');
      if (foco) {
        if (!foco.hasAttribute('tabindex')) foco.setAttribute('tabindex', '-1');
        foco.focus({ preventScroll: true });
      }
    } else {
      window.scrollTo(0, y);
    }
  }

  window.addEventListener('hashchange', function () { abrirMenu(false); estado.yaDestacado = false; pintar(true); });
  aplicarIdioma(IDIOMA_ORIGINAL, {});
  marcarEnfoque();
  pintar(false);
  var inicial = idiomaInicial();
  if (inicial !== IDIOMA_ORIGINAL) cambiarIdioma(inicial, false);
})(typeof globalThis !== 'undefined' ? globalThis : this);
