import os
from celery import Celery
from kombu import Queue


REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
PAID_QUEUE_NAME = os.getenv("PAID_QUEUE_NAME", "priority")


celery_app = Celery(
    "sermonclipper",
    broker=REDIS_URL,
    backend=RESULT_BACKEND,
    include=[
        "worker.tasks.download",
        "worker.tasks.trim",
        "worker.tasks.transitions",
        "worker.tasks.highlight",
        "worker.tasks.publish",
    ],
)

celery_app.conf.task_default_queue = "celery"
celery_app.conf.task_queues = (
    Queue("celery", queue_arguments={"x-max-priority": 10}),
    Queue(PAID_QUEUE_NAME, queue_arguments={"x-max-priority": 10}),
)


@celery_app.task(name="health.ping")
def ping() -> str:
    return "pong"
