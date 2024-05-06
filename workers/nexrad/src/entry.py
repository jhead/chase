import js
import io
from pyodide.http import pyfetch
from nexrad import NEXRADLevel2File

s3Url = "https://noaa-nexrad-level2.s3.amazonaws.com/2024/05/06/KFWS/KFWS20240506_004030_V06"

async def on_fetch(request, env):
    res = await pyfetch(s3Url)
    print(res.ok, res.status)
    
    body = await res.memoryview()
    bytes = body.tobytes()
    fh = io.BytesIO(bytes)

    nx = NEXRADLevel2File(fh)
    print(nx.get_data("REF", 2125))

    # x = js.Uint8Array.new(len(bytes))

    # chunk = fh.read(x.byteLength)
    # x.assign(chunk)

    return js.Response.new("ok", {
        'headers': {
            'content-type': 'application/octet-stream',
            'content-disposition': 'attachment; filename="test"'
        }
    })
