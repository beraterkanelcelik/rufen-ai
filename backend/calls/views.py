import os
import asyncio
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .eleven import start_call
from .poller import poll_conversation


@csrf_exempt
async def test_call(request):
    res = await start_call(os.environ["TEST_TO_NUMBER"])
    cid = res["conversation_id"]
    asyncio.create_task(poll_conversation(cid, f"call:{cid}"))
    return JsonResponse({"conversation_id": cid})
