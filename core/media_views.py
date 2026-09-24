import os
import uuid

from django.conf import settings
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsStaffOrSuperUser

class ImageUploadView(APIView):
    """
    Upload candidate photos.
    - In production (Cloudinary configured): uploads to Cloudinary
    - In development (no Cloudinary): saves to local media folder
    """
    permission_classes = [IsStaffOrSuperUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        from django.conf import settings
        import uuid
        import os

        file = request.FILES.get('image')
        if not file:
            return Response(
                {"detail": "No image file provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_types:
            return Response(
                {"detail": "Invalid file type. Allowed: JPEG, PNG, WebP."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file size (max 5MB)
        max_size = 5 * 1024 * 1024
        if file.size > max_size:
            return Response(
                {"detail": "File too large. Maximum size is 5MB."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if Cloudinary is configured (production)
        cloud_name = settings.CLOUDINARY_CLOUD_NAME
        api_key = settings.CLOUDINARY_API_KEY
        api_secret = settings.CLOUDINARY_API_SECRET

        if cloud_name and api_key and api_secret:
            # Production: Upload to Cloudinary
            try:
                import cloudinary
                import cloudinary.uploader

                cloudinary.config(
                    cloud_name=cloud_name,
                    api_key=api_key,
                    api_secret=api_secret
                )

                result = cloudinary.uploader.upload(
                    file,
                    folder="evoting/candidates",
                    transformation=[
                        {"width": 400, "height": 400, "crop": "fill", "gravity": "face"}
                    ]
                )

                return Response({
                    "url": result["secure_url"],
                    "public_id": result["public_id"],
                    "storage": "cloudinary"
                }, status=status.HTTP_201_CREATED)

            except Exception as e:
                return Response(
                    {"detail": f"Cloudinary upload failed: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        else:
            # Development: Save to local media folder
            try:
                # Ensure media directory exists
                media_path = os.path.join(settings.MEDIA_ROOT, 'candidates')
                os.makedirs(media_path, exist_ok=True)

                # Generate unique filename
                ext = file.name.split('.')[-1] if '.' in file.name else 'jpg'
                filename = f"{uuid.uuid4().hex}.{ext}"
                filepath = os.path.join(media_path, filename)

                # Save file
                with open(filepath, 'wb+') as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)

                # Return full URL (include host for frontend to access)
                # Build absolute URL from request
                relative_url = f"{settings.MEDIA_URL}candidates/{filename}"
                url = request.build_absolute_uri(relative_url)

                return Response({
                    "url": url,
                    "filename": filename,
                    "storage": "local"
                }, status=status.HTTP_201_CREATED)

            except Exception as e:
                return Response(
                    {"detail": f"Local upload failed: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
