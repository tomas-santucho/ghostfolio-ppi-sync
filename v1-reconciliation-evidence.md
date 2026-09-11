# Evidencia de reconciliación v1 — parcial

Fecha de ejecución: 2026-09-11  
Rama: `release/v1.0.0`  
Destino: cuenta Ghostfolio de prueba autorizada (identificadores omitidos)

Este registro contiene sólo rangos, conteos, categorías y resultados. No incluye
credenciales, números de cuenta, descripciones PPI, importes, posiciones ni
fingerprints completos.

## Configuración controlada

- Dos fuentes PPI hacia un único destino Ghostfolio.
- `PPI_CASH_ACTIVITY_IMPORT=true` sólo durante las ejecuciones controladas.
- `PPI_CASH_ENABLED_BUCKETS=ARS,USD_MEP`.
- USD Global y USD CCL no estaban habilitados.
- No se recibió `429` de PPI durante estas verificaciones.

## Import real y rerun

| Caso fuente | Fuente | Primer import | Repetición | Resultado |
| --- | --- | ---: | ---: | --- |
| ARS, 2021-11-05 | primaria | 3 | 0; 3 duplicados | Pass |
| MEP, 2022-03-02 | secundaria | 1 | 0; 1 duplicado | Pass |

La cuenta de destino pasó de 100 a 104 actividades. Una comparación de
identidad fuente→comentario de Ghostfolio confirmó 4 de 4 actividades esperadas
(3 depósitos y 1 retiro), sin revelar los identificadores opacos.

## Cobertura de movimientos existentes

Los dry-runs de ejemplos fuente ya existentes devolvieron cero errores de
validación y sólo duplicados esperados para:

- BUY resuelto;
- SELL resuelto;
- dividendos y fees mapeables.

Los tests de recuperación validaron que una respuesta posterior a persistencia
no reenvía la actividad, que una persistencia parcial reintenta sólo las filas
faltantes y que un resultado no reconciliable detiene la ejecución.

## Límites que permanecen abiertos

Esta evidencia no cierra #22 todavía:

- No hubo muestra fuente de interés con identidad/instrumento verificable.
- No hubo movimiento fuente de cash USD Global ni CCL; ambos continúan
  `disabled / unverified` y la allowlist impide importarlos.
- La vista de actividad de Ghostfolio no expone el símbolo/asset profile de cada
  actividad; el dashboard tampoco representa los assets MANUAL como el campo
  nativo `Cash Balance`. Falta comparar los saldos económicos finales por bucket,
  holdings, income, taxes/fees y performance sobre un rango histórico completo.
- La cuenta de prueba autorizada contiene actividad previa, por lo que esta
  ejecución acotada no prueba por sí sola una reconciliación desde cero.

La próxima campaña RC debe aportar esos datos de forma anonimizada antes de
cerrar la issue #22.
