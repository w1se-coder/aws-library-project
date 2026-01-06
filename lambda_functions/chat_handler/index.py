import json
import boto3
import os
import datetime
import uuid
from botocore.exceptions import ClientError

# İstemcileri handler dışında başlatarak performansı artırıyoruz (Cold Start optimizasyonu)
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client('bedrock-runtime')

# Çevresel değişkenlerden tablo adını alıyoruz
TABLE_NAME = os.environ.get('TABLE_NAME')
table = dynamodb.Table(TABLE_NAME)

# Claude 3 Sonnet Model ID
MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0"

def handler(event, context):
    try:
        # 1. Gelen isteği ayrıştır (Parse input)
        body = json.loads(event.get('body', '{}'))
        user_message = body.get('message')
        session_id = body.get('session_id', str(uuid.uuid4())) # Session ID yoksa yeni oluştur
        
        if not user_message:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Message field is required'})
            }

        # 2. Bedrock (Claude 3 Sonnet) API'sini çağır
        # Claude 3 için payload formatı
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_message
                        }
                    ]
                }
            ]
        }

        response = bedrock.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps(payload)
        )

        # Yanıtı işle
        response_body = json.loads(response['body'].read())
        bot_response = response_body['content'][0]['text']

        # 3. Geçmişi DynamoDB'ye kaydet
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        table.put_item(
            Item={
                'sessionId': session_id,
                'timestamp': timestamp,
                'user_message': user_message,
                'bot_response': bot_response
            }
        )

        # 4. Yanıtı dön
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' # CORS için
            },
            'body': json.dumps({
                'session_id': session_id,
                'response': bot_response
            })
        }

    except ClientError as e:
        print(f"AWS Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'AWS Service Error', 'details': str(e)})
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal Server Error', 'details': str(e)})
        }
