from rest_framework.pagination import PageNumberPagination


class TwentyPerPagePagination(PageNumberPagination):
    """Consistent page size for the main student and election collections."""

    page_size = 20
