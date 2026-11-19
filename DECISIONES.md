# Decisiones

**Tiempo que tardé:** ~1 h (15:16 a 16:15, hora de Argentina). Casi todo fue entender el manual y discutir las decisiones con la IA antes de escribir código; la implementación fue de unos minutos con los tests ya escritos.

## Causa compartida entre dos códigos

Se muestra **una sola vez**, con todos los códigos que la señalan en `codes`, y la probabilidad se combina con **noisy-OR**: `1 − (1 − p1)(1 − p2)…`. Ejemplo: en el Tiggo, bujías es 0,40 para P0300 y 0,30 para P0301 → `1 − 0,6 × 0,7 = 0,58`, y pasa a ser la primera causa. Si dos códigos activos a la vez apuntan a la misma causa, esa causa explica más y tiene que subir. Descarté sumar (con tres códigos puede pasar de 1) y tomar el máximo (no premia que se repita). Con un solo código noisy-OR da la probabilidad del manual, así que el resto no cambia. Limitación: supone que los códigos son independientes y no lo son del todo (P0300 y P0301 son los dos fallos de encendido), así que el número sirve para ordenar, no como porcentaje exacto.

## Otros supuestos

- **Códigos normalizados en los dos lados** (`trim` + mayúsculas): en lo que manda el mecánico y en las claves del manual, porque el Golf tiene `"P0420 "` con espacio. `notFound` devuelve el código normalizado. Los repetidos cuentan una vez.
- **Causas referenciadas sin detalle se excluyen**: P0420 del Tiggo apunta a `sonda-anterior`, que no existe en sus causas. Sin título ni pasos no le sirve al mecánico, y no quise romper el diagnóstico por un dato incompleto del manual.
- **Las causas se buscan siempre dentro del vehículo**: `toma-aire` del Tiggo y del Golf son causas distintas.
- **Orden determinístico**: `codes` y `notFound` alfabéticos; causas por probabilidad y, si empatan, por id. El desempate no dice cuál es más probable: con la misma probabilidad decide el mecánico.
- **Entradas**: `vehicleId` vacío o ausente, `codes` que no es un array, o un código vacío/`null` → `TypeError`. `codes: []` no es error, devuelve todo vacío. Vehículo inexistente → error con el id.
- Probabilidades redondeadas a 4 decimales para sacar el ruido de coma flotante (`1 − 0,55 = 0,44999…`). No normalizo a 1: P0300 del Tiggo suma 0,85 y el manual no lista el resto.

## Dónde se equivocó la IA (o casi)

- Fue pura planificación así que no tuvo mucho lugar a errores. Fue más un debate y una explicación de su parte sobre conceptos que yo no entendía. 

## Qué haría con más tiempo

- Buscar el manual del Tiggo para completar `sonda-anterior` en vez de ocultarla, y validar el manual al cargarlo (referencias rotas, claves con espacios, probabilidades fuera de rango) para detectarlo antes de que llegue al mecánico.
- Avisar en la respuesta cuando hay causas con la misma probabilidad, para que el mecánico sepa que tiene que comprobar las dos.
- Calibrar la combinación de probabilidades con datos reales de reparaciones en vez de suponer independencia.
