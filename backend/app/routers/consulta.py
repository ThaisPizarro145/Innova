import json
import os
import urllib.error
import urllib.request
from typing import Optional

from fastapi import APIRouter, Header, HTTPException

router = APIRouter()

PERUAPI_BASE = "https://peruapi.com/api"
PERUAPI_TOKEN_DEFAULT = os.getenv("PERUAPI_TOKEN", "5cd4393ae49a4fab116f959c083c8180")


def _consultar_peruapi(path: str, api_key: str):
    """
    Reenvía la consulta a peruapi.com desde el servidor.
    peruapi.com no responde el preflight CORS (OPTIONS) con los headers
    necesarios, así que llamarlo directo desde el navegador siempre falla;
    por eso este proxy hace la llamada servidor-a-servidor.
    """
    req = urllib.request.Request(
        f"{PERUAPI_BASE}/{path}",
        headers={
            "X-API-KEY": api_key,
            # Cloudflare bloquea con 403 el User-Agent por defecto de urllib.
            "User-Agent": "Mozilla/5.0 (compatible; FarmaSys/1.0)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode("utf-8", errors="ignore")
        detalle = cuerpo
        try:
            detalle = json.loads(cuerpo).get("message", cuerpo)
        except (ValueError, AttributeError):
            pass
        raise HTTPException(status_code=e.code, detail=detalle or f"Error {e.code} al consultar PeruAPI")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con PeruAPI: {e.reason}")


@router.get("/ruc/{ruc}")
def consultar_ruc(ruc: str, x_api_key: Optional[str] = Header(default=None)):
    if not ruc.isdigit() or len(ruc) != 11:
        raise HTTPException(status_code=400, detail="El RUC debe tener exactamente 11 dígitos.")
    return _consultar_peruapi(f"ruc/{ruc}", x_api_key or PERUAPI_TOKEN_DEFAULT)


@router.get("/dni/{dni}")
def consultar_dni(dni: str, x_api_key: Optional[str] = Header(default=None)):
    if not dni.isdigit() or len(dni) != 8:
        raise HTTPException(status_code=400, detail="El DNI debe tener exactamente 8 dígitos.")
    return _consultar_peruapi(f"dni/{dni}", x_api_key or PERUAPI_TOKEN_DEFAULT)
