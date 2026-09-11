# Alcance y cambios esperados para v1.0.0

## Propósito

v1.0.0 debe ser una versión estable para un conjunto explícito de operaciones, no una promesa de soportar todo lo que PPI pueda devolver.

> Para el conjunto declarado como soportado, el sincronizador debe ser determinista, idempotente, recuperable, auditable y seguro para ejecutarse sin supervisión.

Todo lo que no esté en el contrato de soporte debe reconocerse cuando sea posible, omitirse con una razón determinista y nunca aproximarse inventando operaciones, precios, proceeds o ganancias.

## Alcance propuesto

| Capacidad | v1.0.0 |
| --- | --- |
| BUY/SELL de acciones y CEDEARs resueltos | Soportado |
| Dividendos | Soportado |
| Intereses con moneda, símbolo e instrumento verificados | Soportado |
| Impuestos y fees con mapeo válido | Soportado |
| Cash ARS | Validado en import controlado; disabled para operación normal hasta reconciliar saldos completos |
| Cash USD Global | Disabled / unverified: no hay muestra fuente real |
| Cash USD MEP | Validado en import controlado; disabled para operación normal hasta reconciliar saldos completos |
| Cash USD CCL | Disabled / unverified: no hay movimiento de cash fuente verificable |
| Bootstrap de posiciones | Soportado |
| Múltiples fuentes PPI hacia una cuenta Ghostfolio | Soportado |
| Idempotencia, fingerprints, retries y recovery | Soportado |
| FCI | Diferido post-v1 |
| Cauciones | Diferido post-v1 |
| ONs y amortizaciones | Diferido post-v1 |
| Splits, exchanges y reverse splits | Diferido post-v1 |
| Mergers, delistings y cash-in-lieu | Diferido post-v1 |
| Asociación ambigua automática de comisiones | No soportado |

## Bloqueantes antes de publicar

### 1. Reconciliación económica real — issue #22

Debe probarse el flujo completo en una cuenta Ghostfolio de prueba:

```text
PPI source
  -> normalized transaction
  -> Ghostfolio activity
  -> holdings, cash and performance
```

La evidencia no debe limitarse a contar filas. Debe comparar, cuando aplique:

- posiciones finales;
- cash final por bucket ARS, USD Global, MEP y CCL;
- aportes y retiros;
- ingresos;
- impuestos y fees;
- resultado/performance.

También se requiere un import controlado, una segunda ejecución sin duplicados y una prueba de recuperación ante importación parcial o incierta. Mientras esta evidencia no exista, `PPI_CASH_ACTIVITY_IMPORT` debe permanecer deshabilitado.

### 2. Contrato final de soporte — issue #29

Publicar una matriz con operaciones, monedas, mercados, proveedores, modos de cuenta, bootstrap, límites y enlaces a evidencia. El contrato debe indicar explícitamente qué se difiere y qué efecto tiene la limitación.

### 3. Campaña release candidate — issue #30

Ejecutar contra el commit candidato exacto:

- import limpio y repetido;
- timeout o respuesta incierta;
- error en un batch intermedio;
- rechazo de validación;
- rate limit de PPI;
- recuperación multi-account;
- códigos de salida y evidencia de cero duplicados.

Los escenarios destructivos o de red deben probarse con fault injection local, sin consumir cuota innecesariamente.

### 4. Publicación reproducible — issue #31

Estado: implementación terminada; falta verificar y registrar los digests de las imágenes candidatas publicadas.

El build debe usar exclusivamente el lockfile:

```dockerfile
RUN bun install --frozen-lockfile
```

No debe existir fallback silencioso a `bun install`. La imagen candidata debe probarse en `linux/amd64` y `linux/arm64`, ejecutarse como usuario no root, excluir credenciales y registrar su digest publicado.

### 5. Operación y mantenimiento — issue #32

Estado: el CLI protege sync y bootstrap con un lock file atómico que contiene PID, recupera locks de procesos ya terminados y libera el lock al finalizar. Falta la validación operativa en el entorno de cron/contenedor y completar troubleshooting de release.

La documentación debe cubrir instalación, precedencia de configuración, cuentas, fechas, dry-run, bootstrap, retries, cuota, recovery y troubleshooting seguro. Debe existir una política real para impedir ejecuciones simultáneas.

### 6. Publicación estable — issue #33

Antes del tag final deben estar sincronizados el package version, changelog, release notes, matriz de soporte, instrucciones de upgrade, imagen publicada y digest.

## Hardening que falta convertir en trabajo explícito

### Lectura exhaustiva de Ghostfolio

La reconciliación de writes inciertos sólo es segura si `GET /api/v1/activities` recupera exhaustivamente las actividades relevantes del target. Antes de v1 hay que confirmar el contrato de la versión de Ghostfolio usada o implementar paginación/filtros por cuenta y fingerprint.

Garantía requerida:

> Todas las actividades destino relevantes para reconciliación se recuperan exhaustivamente.

Implementado: el cliente acepta las respuestas completas compatibles (`[]` o `{ activities: [] }`) y rechaza explícitamente respuestas que declaren paginación, `hasMore`, `nextPage`, `count` o `total` superiores a las filas recibidas. Así nunca reconcilia contra un historial detectablemente incompleto. La campaña RC debe registrar la versión de Ghostfolio y confirmar su contrato de lista completa para el target real.

### Recuperación de autenticación

Para PPI y, conceptualmente, Ghostfolio cuando corresponda:

```text
401 -> invalidar token -> autenticar -> reintentar una vez
401 otra vez -> detenerse
```

Implementado y cubierto por tests: tanto PPI como Ghostfolio con `GHOSTFOLIO_SECURITY_TOKEN` invalidan la sesión al primer `401`, autentican nuevamente y reintentan una vez. Un segundo `401` detiene la ejecución; no hay loops de refresh. Un `GHOSTFOLIO_ACCESS_TOKEN` estático no se puede renovar y falla directamente.

### Exclusión de ejecuciones concurrentes

Implementado: el CLI usa un lock file atómico por defecto en el directorio temporal del sistema. Se puede fijar una ubicación estable con `SYNC_LOCK_PATH`; el archivo incluye PID y hostname. Un lock de otra instancia/container falla cerrado y sólo se recupera tras una lease de seis horas; un lock del mismo host se recupera cuando su PID ya no existe. El ejemplo Compose monta un volumen compartido para que dos contenedores no puedan importar simultáneamente.

### Estado benigno para operaciones unsupported

Una operación deliberadamente fuera del alcance debe incrementar `unsupported`, registrar una razón estable y permitir que el resto del lote continúe. No debe convertirse en `validationFailed` cuando el sistema decidió conscientemente no soportarla.

Ejemplos:

```text
FCI              -> unsupported: fci_not_supported
CAUCION          -> unsupported: caucion_not_supported
ON_AMORTIZATION  -> unsupported: bond_amortization_not_supported
STOCK_SPLIT      -> unsupported: corporate_action_not_supported
CASH_MERGER      -> unsupported: cash_merger_not_supported
```

ATVI debe continuar sin generar una venta normal ni acciones MSFT hasta disponer de evidencia de settlement y una representación fiel.

Implementado: FCI, cauciones, deuda amortizable, canjes, splits, fusiones, mergers, adquisiciones, delistings, bajas de cotización y cash-in-lieu se marcan como `unsupported` con categoría estable y nunca generan operaciones sintéticas. ATVI queda deliberadamente pendiente de evidencia de settlement; una fila que no se identifique como corporate action todavía requiere clasificación basada en un fixture real y sanitizado.

## Comisiones

Las issues #3 y #28 pertenecen a la misma familia y deben consolidarse o marcarse como duplicadas.

La decisión de v1 es:

- si PPI entrega un identificador estable de operación, ejecución, orden o settlement, asociar la comisión exactamente una vez;
- si no existe ese vínculo, no inferir por cercanía, fecha o diferencia de importe;
- conservar un warning y omitir o importar como fee standalone según la evidencia y el contrato;
- documentar que el cost basis y la performance pueden quedar incompletos.

## Trabajo diferido

FCI, cauciones, ONs/amortizaciones y corporate actions deben quedar como backlog post-v1. Son dominios que requieren fixtures, identidad estable, reversals, recuperación, reconciliación económica y una representación fiel en Ghostfolio.

No deben implementarse como pares artificiales `SELL`/`BUY` que inventen proceeds, ganancias o conversiones.

## Criterio de aprobación

Se puede publicar v1.0.0 cuando sea posible ejecutar una imagen versionada y afirmar, con evidencia:

- PPI sólo se consulta; nunca se envían órdenes ni se modifican cuentas;
- no se inventan operaciones ni conversiones;
- una segunda ejecución produce cero duplicados;
- un timeout posterior a persistencia no duplica actividades;
- dos procesos no pueden sincronizar simultáneamente;
- una operación desconocida no rompe ni contamina el resto;
- todo lo fuera de la matriz aparece como unsupported explícito;
- los números finales fueron reconciliados económicamente;
- el upgrade desde v0.5 conserva identidad;
- la imagen `amd64`/`arm64`, documentación y release notes son reproducibles y consistentes.

La ausencia de soporte para FCI, cauciones u ONs no impide v1 si esas exclusiones están declaradas y el comportamiento unsupported es seguro.

## Estado de implementación al 2026-09-11

La evidencia controlada actual está en [`v1-reconciliation-evidence.md`](v1-reconciliation-evidence.md). No sustituye la reconciliación económica completa de #22.

| Área | Estado | Evidencia pendiente |
| --- | --- | --- |
| Fallback de órdenes históricas y multi-account | Implementado y validado en dry-run para la cuenta 177551 | Import controlado de RC |
| Sesiones PPI/Ghostfolio | Implementado; refresh único ante 401 | Prueba contra instancia RC |
| Reconciliación de writes inciertos | Implementada y fail-safe ante paginación detectable | Confirmar contrato de la versión Ghostfolio objetivo |
| Lock de proceso | Implementado y testeado | Validar la misma `SYNC_LOCK_PATH` en cron/contenedor |
| Unsupported corporate actions | Implementado para descripciones identificables | Fixture sanitizado del settlement ATVI |
| Build multi-arquitectura reproducible | Workflow amd64/arm64 y lockfile estricto implementados | Publicar y registrar digests |
| Cash y reconciliación económica | Campaña 2016–2026 importada y reejecutada sin duplicados; ARS/MEP aún no concilian por operaciones excluidas; Global USD/CCL disabled | Resolver o excluir contractualmente la discrepancia económica de issue #22 |
