import json
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_lambda as _lambda,
    aws_iam as iam,
    aws_apigateway as apigw,
    aws_s3 as s3,
    aws_opensearchserverless as aoss,
    aws_bedrock as bedrock,
    aws_cognito as cognito,
)
from constructs import Construct

class ServerlessProjectStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 1. LibraryBooks Table
        books_table = dynamodb.Table(self, "LibraryBooksTable",
            table_name="LibraryBooks",
            partition_key=dynamodb.Attribute(name="bookId", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY
        )

        # 2. UserLoans Table
        loans_table = dynamodb.Table(self, "UserLoansTable",
            table_name="UserLoans",
            partition_key=dynamodb.Attribute(name="userId", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY
        )

        # 3. Knowledge Base Data Source (S3 Bucket)
        kb_bucket = s3.Bucket(self, "LibraryDocumentsBucket",
            bucket_name="library-documents-bucket-unique-id", # Bucket isimleri global unique olmalı, buraya rastgelelik eklemek iyi olur ama basitlik için böyle bırakıyorum. Çakışırsa değiştirilmeli.
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True
        )

        # 4. OpenSearch Serverless Collection
        # Encryption Policy
        encryption_policy = aoss.CfnSecurityPolicy(self, "LibraryKbEncryptionPolicy",
            name="library-kb-encryption",
            type="encryption",
            policy=json.dumps({
                "Rules": [{"ResourceType": "collection", "Resource": ["collection/library-kb-collection"]}],
                "AWSOwnedKey": True
            })
        )

        # Network Policy
        network_policy = aoss.CfnSecurityPolicy(self, "LibraryKbNetworkPolicy",
            name="library-kb-network",
            type="network",
            policy=json.dumps([
                {
                    "Rules": [{"ResourceType": "collection", "Resource": ["collection/library-kb-collection"]}, {"ResourceType": "dashboard", "Resource": ["collection/library-kb-collection"]}],
                    "AllowFromPublic": True
                }
            ])
        )

        # Collection
        collection = aoss.CfnCollection(self, "LibraryKbCollection",
            name="library-kb-collection",
            type="VECTORSEARCH",
            description="Collection for Library Knowledge Base"
        )
        collection.add_dependency(encryption_policy)
        collection.add_dependency(network_policy)

        # IAM Role for Bedrock Knowledge Base
        kb_role = iam.Role(self, "LibraryBedrockKbRole",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com")
        )
        
        # Permissions for S3
        kb_bucket.grant_read(kb_role)
        
        # Permissions for AOSS
        kb_role.add_to_policy(iam.PolicyStatement(
            actions=["aoss:APIAccessAll"],
            resources=[collection.attr_arn]
        ))

        # 7. Library Assistant Lambda Function
        assistant_handler = _lambda.Function(self, "LibraryAssistantHandler",
            runtime=_lambda.Runtime.PYTHON_3_11,
            code=_lambda.Code.from_asset("lambda_functions/library_assistant"),
            handler="index.handler",
            timeout=Duration.seconds(30),
            environment={
                "BOOKS_TABLE_NAME": books_table.table_name,
                "MODEL_ID": "anthropic.claude-3-sonnet-20240229-v1:0",
                "KNOWLEDGE_BASE_ID": knowledge_base.attr_knowledge_base_id
            }
        )

        # Grant permissions
        books_table.grant_read_data(assistant_handler)
        
        assistant_handler.add_to_role_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel", "bedrock:Converse", "bedrock:Retrieve", "bedrock:RetrieveAndGenerate"],
            resources=["*"]
        ))

        # Data Access Policy for AOSS (Updated to include Lambda Role)
        access_policy = aoss.CfnAccessPolicy(self, "LibraryKbAccessPolicy",
            name="library-kb-access",
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
                    "Principal": [kb_role.role_arn, assistant_handler.role.role_arn]
                }
            ])
        )

        # 9. Cognito User Pool
        user_pool = cognito.UserPool(self, "LibraryUserPool",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True)
        )
        
        user_pool_client = user_pool.add_client("LibraryAppClient")

        # 10. API Gateway Authorizer
        authorizer = apigw.CognitoUserPoolsAuthorizer(self, "LibraryAuthorizer",
            cognito_user_pools=[user_pool]
        )

        # 8. API Gateway
        api = apigw.LambdaRestApi(self, "LibraryApi",
            handler=assistant_handler,
            proxy=False,
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS
            )
        )

        # /assistant endpoint
        assistant_resource = api.root.add_resource("assistant")
        assistant_resource.add_method("POST")

        # /chat endpoint (Secured)
        chat_resource = api.root.add_resource("chat")
        chat_resource.add_method("POST",
            authorizer=authorizer,
            authorization_type=apigw.AuthorizationType.COGNITO
        )
