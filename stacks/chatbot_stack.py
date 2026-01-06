import json
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    aws_dynamodb as dynamodb,
    aws_cognito as cognito,
    aws_iam as iam,
    aws_s3 as s3,
    aws_opensearchserverless as aoss,
    aws_bedrock as bedrock,
)
from constructs import Construct

class ChatbotStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 1. Cognito User Pool
        user_pool = cognito.UserPool(self, "ChatbotUserPool",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True)
        )

        # 2. DynamoDB Table for Chat History
        table = dynamodb.Table(self, "ChatHistoryTable",
            table_name="ChatHistory",
            partition_key=dynamodb.Attribute(name="sessionId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="timestamp", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY # Geliştirme ortamı için
        )

        # 3. Knowledge Base Data Source (S3 Bucket)
        kb_bucket = s3.Bucket(self, "KnowledgeBaseBucket",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True
        )

        # 4. OpenSearch Serverless Collection
        # Encryption Policy
        encryption_policy = aoss.CfnSecurityPolicy(self, "AossEncryptionPolicy",
            name="chatbot-kb-encryption",
            type="encryption",
            policy=json.dumps({
                "Rules": [{"ResourceType": "collection", "Resource": ["collection/chatbot-kb-collection"]}],
                "AWSOwnedKey": True
            })
        )

        # Network Policy
        network_policy = aoss.CfnSecurityPolicy(self, "AossNetworkPolicy",
            name="chatbot-kb-network",
            type="network",
            policy=json.dumps([
                {
                    "Rules": [{"ResourceType": "collection", "Resource": ["collection/chatbot-kb-collection"]}, {"ResourceType": "dashboard", "Resource": ["collection/chatbot-kb-collection"]}],
                    "AllowFromPublic": True
                }
            ])
        )

        # Collection
        collection = aoss.CfnCollection(self, "ChatbotKbCollection",
            name="chatbot-kb-collection",
            type="VECTORSEARCH",
            description="Collection for Chatbot Knowledge Base"
        )
        collection.add_dependency(encryption_policy)
        collection.add_dependency(network_policy)

        # IAM Role for Bedrock Knowledge Base
        kb_role = iam.Role(self, "BedrockKbRole",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com")
        )
        
        # Permissions for S3
        kb_bucket.grant_read(kb_role)
        
        # Permissions for AOSS
        kb_role.add_to_policy(iam.PolicyStatement(
            actions=["aoss:APIAccessAll"],
            resources=[collection.attr_arn]
        ))

        # Data Access Policy for AOSS (Allowing Bedrock Role)
        access_policy = aoss.CfnAccessPolicy(self, "AossAccessPolicy",
            name="chatbot-kb-access",
            type="data",
            policy=json.dumps([
                {
                    "Rules": [
                        {
                            "ResourceType": "collection",
                            "Resource": [f"collection/{collection.name}"],
                            "Permission": ["aoss:CreateCollectionItems", "aoss:DeleteCollectionItems", "aoss:UpdateCollectionItems", "aoss:DescribeCollectionItems"]
                        },
                        {
                            "ResourceType": "index",
                            "Resource": [f"index/{collection.name}/*"],
                            "Permission": ["aoss:CreateIndex", "aoss:DeleteIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"]
                        }
                    ],
                    "Principal": [kb_role.role_arn]
                }
            ])
        )

        # 5. Bedrock Knowledge Base
        # Not: Vektör indeksinin AOSS içinde oluşturulması gerekir. CDK bu indeksi otomatik oluşturmaz.
        # Bu örnekte konfigürasyonu tanımlıyoruz, ancak deploy sonrası indeksin manuel veya Custom Resource ile oluşturulması gerekebilir.
        
        knowledge_base = bedrock.CfnKnowledgeBase(self, "ChatbotKnowledgeBase",
            name="ChatbotKB",
            role_arn=kb_role.role_arn,
            knowledge_base_configuration=bedrock.CfnKnowledgeBase.KnowledgeBaseConfigurationProperty(
                type="VECTOR",
                vector_knowledge_base_configuration=bedrock.CfnKnowledgeBase.VectorKnowledgeBaseConfigurationProperty(
                    embedding_model_arn="arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1"
                )
            ),
            storage_configuration=bedrock.CfnKnowledgeBase.StorageConfigurationProperty(
                type="OPENSEARCH_SERVERLESS",
                opensearch_serverless_configuration=bedrock.CfnKnowledgeBase.OpenSearchServerlessConfigurationProperty(
                    collection_arn=collection.attr_arn,
                    vector_index_name="bedrock-knowledge-base-default-index",
                    field_mapping=bedrock.CfnKnowledgeBase.OpenSearchServerlessFieldMappingProperty(
                        vector_field="bedrock-knowledge-base-default-vector",
                        text_field="AMAZON_BEDROCK_TEXT_CHUNK",
                        metadata_field="AMAZON_BEDROCK_METADATA"
                    )
                )
            )
        )
        knowledge_base.add_dependency(collection)
        knowledge_base.add_dependency(access_policy)

        # 6. Data Source
        data_source = bedrock.CfnDataSource(self, "ChatbotKbDataSource",
            knowledge_base_id=knowledge_base.attr_knowledge_base_id,
            name="S3DataSource",
            data_source_configuration=bedrock.CfnDataSource.DataSourceConfigurationProperty(
                type="S3",
                s3_configuration=bedrock.CfnDataSource.S3DataSourceConfigurationProperty(
                    bucket_arn=kb_bucket.bucket_arn
                )
            )
        )

        # 7. Lambda Function (Chat Handler)
        chat_handler = _lambda.Function(self, "ChatHandler",
            runtime=_lambda.Runtime.PYTHON_3_11,
            code=_lambda.Code.from_asset("lambda_functions/chat_handler"),
            handler="index.handler",
            timeout=Duration.seconds(30), # Bedrock yanıtı uzun sürebilir
            environment={
                "TABLE_NAME": table.table_name,
                "BEDROCK_MODEL_ID": "anthropic.claude-3-sonnet-20240229-v1:0",
                "KNOWLEDGE_BASE_ID": knowledge_base.attr_knowledge_base_id
            }
        )

        # Grant Lambda permissions to read/write DynamoDB
        table.grant_read_write_data(chat_handler)

        # Grant Lambda permissions to invoke Bedrock and Query Knowledge Base
        chat_handler.add_to_role_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel", "bedrock:Retrieve", "bedrock:RetrieveAndGenerate"],
            resources=["*"] 
        ))

        # 8. API Gateway
        api = apigw.LambdaRestApi(self, "ChatbotApi",
            handler=chat_handler,
            proxy=False,
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS
            )
        )

        # Define API resources and methods
        chat_resource = api.root.add_resource("chat")
        chat_resource.add_method("POST") # POST /chat
